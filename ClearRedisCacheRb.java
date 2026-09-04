package com.fincore.TemplateConfigurationService.cache;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.HashSet;
import java.util.Set;

/**
 * Evicts Report Builder's Redis cache entries for a given templateId.
 *
 * This service does not own the CacheManager backing these entries - Report Builder does,
 * via its own Spring Cache config. So we can't use @CacheEvict here; instead we delete the
 * underlying Redis keys directly. These MUST mirror Report Builder's cache names and key
 * formats exactly, or eviction silently becomes a no-op:
 *   - "reportTemplates" cache, key = templateId               -> reportTemplates::<templateId>
 *   - "reportVariants" cache, key = templateId + ':' + variantCode -> reportVariants::<templateId>:<variantCode>
 *
 * If Report Builder ever changes its cache names, key format, or the Spring Data Redis
 * key separator, update the constants below to match.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ReportBuilderCacheEvictor {

    private final StringRedisTemplate redisTemplate;

    private static final String TEMPLATE_CACHE_PREFIX = "reportTemplates::";
    private static final String VARIANT_CACHE_PREFIX = "reportVariants::";

    public void evictReportBuilderCache(String templateId) {
        if (!StringUtils.hasText(templateId)) {
            return;
        }

        try {
            redisTemplate.delete(TEMPLATE_CACHE_PREFIX + templateId);

            String variantKeyPattern = VARIANT_CACHE_PREFIX + templateId + ":*";
            Set<String> variantKeys = new HashSet<>();
            ScanOptions scanOptions = ScanOptions.scanOptions().match(variantKeyPattern).count(200).build();

            try (Cursor<byte[]> cursor = redisTemplate.getConnectionFactory()
                    .getConnection()
                    .keyCommands()
                    .scan(scanOptions)) {
                while (cursor.hasNext()) {
                    variantKeys.add(new String(cursor.next()));
                }
            }

            if (!variantKeys.isEmpty()) {
                redisTemplate.delete(variantKeys);
            }

            log.info("Evicted Report Builder cache for templateId: {} ({} variant keys)",
                    templateId, variantKeys.size());
        } catch (Exception e) {
            // Never fail the calling transaction because cache eviction had trouble - log and move on.
            log.error("Failed to evict Report Builder cache for templateId: {}", templateId, e);
        }
    }
}



















package com.fincore.TemplateConfigurationService.requests.service;

import com.fincore.TemplateConfigurationService.cache.ReportBuilderCacheEvictor;
import com.fincore.TemplateConfigurationService.dto.FilterRuleDto;
import com.fincore.TemplateConfigurationService.dto.TemplatePayload;
import com.fincore.TemplateConfigurationService.dto.VariantDto;
import com.fincore.TemplateConfigurationService.dto.VariantParamDto;
import com.fincore.TemplateConfigurationService.dto.*;
import com.fincore.TemplateConfigurationService.requests.dto.*;
import com.fincore.TemplateConfigurationService.util.JsonCompareUtil;
import com.fincore.TemplateConfigurationService.entity.FilterRule;
import com.fincore.TemplateConfigurationService.entity.ReportTemplate;
import com.fincore.TemplateConfigurationService.entity.ReportTemplateHistory;
import com.fincore.TemplateConfigurationService.entity.ReportVariant;
import com.fincore.TemplateConfigurationService.entity.VariantParamDef;
import com.fincore.TemplateConfigurationService.exception.BadRequestException;
import com.fincore.TemplateConfigurationService.exception.TemplateNotFoundException;
import com.fincore.TemplateConfigurationService.repository.FilterRuleRepository;
import com.fincore.TemplateConfigurationService.repository.ReportTemplateHistoryRepository;
import com.fincore.TemplateConfigurationService.repository.ReportTemplateRepository;
import com.fincore.TemplateConfigurationService.repository.ReportVariantRepository;
import com.fincore.TemplateConfigurationService.repository.VariantParamDefRepository;
import com.fincore.TemplateConfigurationService.requests.entity.TemplateRequest;
import com.fincore.TemplateConfigurationService.requests.enums.ChangeType;
import com.fincore.TemplateConfigurationService.requests.enums.RequestStatus;
import com.fincore.TemplateConfigurationService.requests.repository.TemplateRequestRepository;
import com.fincore.TemplateConfigurationService.requests.validation.TemplateRequestValidationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;

import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
@RequiredArgsConstructor
@Slf4j
public class TemplateRequestServiceImpl implements TemplateRequestService {

    private static final ZoneId IST_ZONE = ZoneId.of("Asia/Kolkata");

    private final TemplateRequestRepository templateRequestRepository;
    private final ReportTemplateRepository reportTemplateRepository;
    private final ReportTemplateHistoryRepository reportTemplateHistoryRepository;
    private final ReportVariantRepository variantRepository;
    private final VariantParamDefRepository paramRepository;
    private final FilterRuleRepository filterRuleRepository;
    private final TemplateRequestValidationService templateRequestValidationService;
    private final BusinessSecurityService businessSecurityService;
    private final JsonMapper jsonMapper;
    private final JsonCompareUtil jsonCompareUtil;
    private final ReportBuilderCacheEvictor cacheEvictor;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public TemplateRequest createRequest(CreateTemplateRequestDto dto, String creatorId, String token) throws JacksonException {
        businessSecurityService.validateUserAction(token, dto.getChangeType());
        templateRequestValidationService.validate(dto);

        String targetId = dto.getPayload().getTemplate().getReportMeta().getReportId();
        if (!StringUtils.hasText(targetId)) {
            throw new BadRequestException("reportId is required");
        }

        List<TemplateRequest> duplicates = templateRequestRepository.findByTargetIdAndReqStatus(targetId, RequestStatus.PENDING);
        if (!duplicates.isEmpty()) {
            throw new DataIntegrityViolationException("A pending request for this template already exists");
        }

        if (dto.getChangeType() == ChangeType.UPDATE) {
            ReportTemplate activeTemplate = reportTemplateRepository.findFirstByReportIdAndStatus(targetId, "ACTIVE").orElseThrow(() -> new BadRequestException("Active template not found for reportId: " + targetId));

            // Reconstruct the old active template payload
            TemplatePayload oldPayload = parseOldTemplate(activeTemplate.getTemplateJson());
            oldPayload.setVariants(fetchVariantsAsDtos(activeTemplate.getTemplateId()));

            // Capture the diffs into variables
            Map<String, Map<String, ValueDiff>> cellDiffs = jsonCompareUtil.compareCells(oldPayload, dto.getPayload());
            Map<String, Map<String, ValueDiff>> colDiffs = jsonCompareUtil.compareColumns(oldPayload, dto.getPayload());
            Map<String, Map<String, ValueDiff>> variantDiffs = jsonCompareUtil.compareVariants(oldPayload.getVariants(), dto.getPayload().getVariants());
            Map<String, Map<String, ValueDiff>> paramDiffs = jsonCompareUtil.compareGlobalParams(oldPayload.getTemplate().getGlobalParams(), dto.getPayload().getTemplate().getGlobalParams());
            Map<String, Map<String, ValueDiff>> metaAndRowDiffs = jsonCompareUtil.compareTemplateLevel(oldPayload, dto.getPayload());

            // LOG THE EXACT DIFFERENCES TO THE CONSOLE
            if (!cellDiffs.isEmpty()) log.info("DETECTED CELL CHANGES: {}", cellDiffs);
            if (!colDiffs.isEmpty()) log.info("DETECTED COLUMN CHANGES: {}", colDiffs);
            if (!variantDiffs.isEmpty()) log.info("DETECTED VARIANT CHANGES: {}", variantDiffs);
            if (!paramDiffs.isEmpty()) log.info("DETECTED PARAM CHANGES: {}", paramDiffs);
            if (!metaAndRowDiffs.isEmpty()) log.info("DETECTED META / ROW DIFFS CHANGES: {}", metaAndRowDiffs);

            boolean hasChanges = !cellDiffs.isEmpty() || !colDiffs.isEmpty() || !variantDiffs.isEmpty() || !paramDiffs.isEmpty() || !metaAndRowDiffs.isEmpty();

            // If everything is empty, there are no changes
            if (!hasChanges) {
                throw new BadRequestException("No changes detected. Update request cannot be saved.");
            }
        }

        TemplateRequest request = TemplateRequest.builder().creatorId(creatorId).changeType(dto.getChangeType()).reqStatus(RequestStatus.PENDING).reqDate(LocalDateTime.now(IST_ZONE)).payload(jsonMapper.writeValueAsString(dto.getPayload())).targetId(targetId).remarks(dto.getRemarks()).build();

        return templateRequestRepository.save(request);
    }


    // NEW: Parses the DB JSON (which only stores the Template object) into a full TemplatePayload wrapper
    private TemplatePayload parseOldTemplate(String json) {
        try {
            TemplatePayload.Template template = jsonMapper.readValue(json, TemplatePayload.Template.class);
            return TemplatePayload.builder().template(template).variants(new ArrayList<>()).build();
        } catch (Exception e) {
            throw new IllegalStateException("Invalid active template JSON", e);
        }
    }


    // NEW (Extracted from old fetchVariantsAsJson): Builds a list of VariantDto objects
    private List<VariantDto> fetchVariantsAsDtos(String templateId) {
        List<ReportVariant> variants = variantRepository.findByTemplateId(templateId);
        List<VariantDto> dtos = new ArrayList<>();
        for (ReportVariant variant : variants) {
            List<VariantParamDef> params = paramRepository.findByVariantIdIn(List.of(variant.getVariantId()));
            List<FilterRule> rules = filterRuleRepository.findByVariantIdIn(List.of(variant.getVariantId()));

            VariantDto dto = VariantDto.builder().variantCode(variant.getVariantCode()).variantName(variant.getVariantName()).description(variant.getDescription()).status(variant.getStatus()).params(params.stream().map(p -> VariantParamDto.builder().paramName(p.getParamName()).label(p.getLabel()).paramType(p.getParamType()).required("Y".equalsIgnoreCase(p.getRequired())).multiValued("Y".equalsIgnoreCase(p.getMultiVal())).uiHint(p.getUiHint()).validation(p.getValidation()).build()).toList()).filterRules(rules.stream().map(r -> FilterRuleDto.builder().dbColumn(r.getDbColumn()).operator(r.getOperator()).paramName(r.getParamName()).scopeType(r.getScopeType()).scopeValue(r.getScopeValue()).build()).toList()).build();
            dtos.add(dto);
        }
        return dtos;
    }


    @Override
    @Transactional(rollbackFor = Exception.class)
    public TemplateRequest processRequest(ProcessTemplateRequestDto dto, String executorId) throws JacksonException {
        TemplateRequest request = templateRequestRepository.findById(dto.getRequestId()).orElseThrow(() -> new TemplateNotFoundException("Request not found: " + dto.getRequestId()));

        if (executorId.equals(request.getCreatorId())) {
            throw new IllegalStateException("Self-approval is not allowed");
        }

        if (request.getReqStatus() != RequestStatus.PENDING) {
            throw new IllegalStateException("Request already processed");
        }

        if (dto.getStatus() != RequestStatus.ACCEPTED && dto.getStatus() != RequestStatus.REJECTED) {
            throw new IllegalArgumentException("Only ACCEPTED or REJECTED is allowed for processing");
        }

        request.setExecutorId(executorId);
        request.setExecutorRemarks(dto.getRemarks());
        request.setExecutionDate(LocalDateTime.now(IST_ZONE));
        request.setReqStatus(dto.getStatus());


        if (dto.getStatus() == RequestStatus.ACCEPTED) {
//            TemplatePayload payload = jsonMapper.readValue(request.getPayload(), TemplatePayload.class);
            List<String> affectedTemplateIds = switch (request.getChangeType()) {
                case ADD -> handleCreate(request);
                case UPDATE -> handleUpdate(request);
                case DELETE -> handleDelete(request);
                case STATUS -> handleStatusChange(request);
                case ROLLBACK -> handleRollback(request);
                default ->
                        throw new UnsupportedOperationException("Unsupported changeType: " + request.getChangeType());
            };
            // Evict Report Builder's Redis cache for every templateId touched by this approval,
            // now that the DB write has committed cleanly.
            affectedTemplateIds.forEach(cacheEvictor::evictReportBuilderCache);
            request.setExecutionRemarks("Successfully processed approval.");
        } else {
            request.setExecutionRemarks("Request rejected.");
        }

        return templateRequestRepository.save(request);
    }


    @Override
    @Transactional(rollbackFor = Exception.class)
    public TemplateRequest cancelRequest(CancelTemplateRequestDto dto, String userId) {
        TemplateRequest request = templateRequestRepository.findById(dto.getRequestId()).orElseThrow(() -> new TemplateNotFoundException("Request not found: " + dto.getRequestId()));

        if (!request.getCreatorId().equals(userId)) {
            throw new AccessDeniedException("You can only cancel your own requests");
        }

        if (request.getReqStatus() != RequestStatus.PENDING) {
            throw new IllegalStateException("Only pending requests can be cancelled");
        }

        request.setReqStatus(RequestStatus.CANCELLED);
        request.setExecutorId(userId);
        request.setExecutionDate(LocalDateTime.now(IST_ZONE));
        request.setExecutorRemarks("CANCELLED BY USER: " + (dto.getRemarks() != null ? dto.getRemarks() : "No remarks"));
        return templateRequestRepository.save(request);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public TemplateRequest modifyRequest(TemplateRequestModifyDto dto, String userId) {
        TemplateRequest request = templateRequestRepository.findById(dto.getRequestId()).orElseThrow(() -> new TemplateNotFoundException("Request not found: " + dto.getRequestId()));

        if (!request.getCreatorId().equals(userId)) {
            throw new AccessDeniedException("You can only modify your own requests");
        }

        if (!(request.getReqStatus() == RequestStatus.PENDING || request.getReqStatus() == RequestStatus.REJECTED)) {
            throw new IllegalStateException("Only pending or rejected requests can be modified");
        }

        request.setPayload(jsonMapper.writeValueAsString(dto.getPayload()));
        Optional.ofNullable(dto.getPayload().getRemarks()).ifPresent(request::setRemarks);
        return request;
    }

    @Override
    @Transactional(readOnly = true)
    public List<TemplateRequestSummaryDto> getMyRequests(String userId) {
        return templateRequestRepository.findByCreatorId(userId).stream().map(this::mapToSummaryDto).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<TemplateRequestSummaryDto> getPendingRequests(String userId) {
        return templateRequestRepository.findByCreatorIdNotAndReqStatus(userId, RequestStatus.PENDING).stream().map(this::mapToSummaryDto).toList();
    }

    private List<String> handleCreate(TemplateRequest request) {
        TemplatePayload payload = jsonMapper.readValue(request.getPayload(), TemplatePayload.class);
        LocalDateTime now = LocalDateTime.now(IST_ZONE);
        String reportId = payload.getTemplate().getReportMeta().getReportId();
        int incomingVersion = parseVersion(payload.getTemplate().getTemplateMeta().getVersion());
        String templateJson = serialize(payload.getTemplate());

        List<String> affectedTemplateIds = new ArrayList<>();

        reportTemplateRepository.findFirstByReportIdAndStatus(reportId, "ACTIVE").ifPresent(existing -> {
            affectedTemplateIds.add(existing.getTemplateId());
            archiveTemplate(existing, request.getExecutorId(), now);
            deleteVariants(existing.getTemplateId());
            reportTemplateRepository.delete(existing);
        });

        ReportTemplate template = ReportTemplate.builder().reportId(reportId).templateName(payload.getTemplate().getReportMeta().getReportName()).description(payload.getTemplate().getTemplateMeta().getDescription()).versionNo(incomingVersion).status("ACTIVE").templateJson(templateJson).createdAt(now).createdBy(request.getCreatorId()).updatedAt(now).updatedBy(request.getExecutorId()).remarks(request.getRemarks()).build();

        ReportTemplate saved = reportTemplateRepository.save(template);
        saveVariants(payload, saved, request, now);

        affectedTemplateIds.add(saved.getTemplateId());
        return affectedTemplateIds;
    }

    private List<String> handleUpdate(TemplateRequest request) {
        TemplatePayload payload = jsonMapper.readValue(request.getPayload(), TemplatePayload.class);
        String targetId = request.getTargetId();
        if (!StringUtils.hasText(targetId)) {
            throw new BadRequestException("targetId required for UPDATE");
        }

        LocalDateTime now = LocalDateTime.now(IST_ZONE);

        ReportTemplate template = reportTemplateRepository.findFirstByReportId(targetId).orElseThrow(() -> new TemplateNotFoundException("Template not found for reportId: " + targetId));

        archiveTemplate(template, request.getExecutorId(), now);
        int newVersion = Optional.ofNullable(template.getCreatedFrom()).isPresent() ? findVersion(template.getTemplateId(), template.getVersionNo()) : template.getVersionNo() + 1;

        payload.getTemplate().getTemplateMeta().setVersion(String.valueOf(newVersion));
        template.setReportId(payload.getTemplate().getReportMeta().getReportId());
        template.setTemplateName(payload.getTemplate().getReportMeta().getReportName());
        template.setDescription(payload.getTemplate().getTemplateMeta().getDescription());
        template.setRemarks(request.getRemarks());
        template.setTemplateJson(serialize(payload.getTemplate()));
        template.setVersionNo(newVersion);
        template.setUpdatedAt(now);
        template.setUpdatedBy(request.getExecutorId());

        ReportTemplate savedTemplate = reportTemplateRepository.save(template);
        deleteVariants(savedTemplate.getTemplateId());
        saveVariants(payload, savedTemplate, request, now);

        return List.of(savedTemplate.getTemplateId());
    }

    private int findVersion(String templateId, int version) {
        return reportTemplateHistoryRepository.getLatestVersion(templateId).orElse(version) + 1;
    }

    @Transactional
    private List<String> handleRollback(TemplateRequest request) {
        TemplateRollbackRequestDto payload = jsonMapper.readValue(request.getPayload(), TemplateRollbackRequestDto.class);
        String targetId = request.getTargetId();
        if (!StringUtils.hasText(targetId)) {
            throw new BadRequestException("targetId required for UPDATE");
        }

        LocalDateTime now = LocalDateTime.now(IST_ZONE);
        ReportTemplate template = reportTemplateRepository.findFirstByReportId(targetId).orElseThrow(() -> new TemplateNotFoundException("Template not found for reportId: " + targetId));

        archiveTemplate(template, request.getExecutorId(), now);
        log.info("Archived active template!");

        int version = Integer.parseInt(payload.getRollbackTo());
        JsonNode templateNode = payload.getTemplate();
        log.info(templateNode.toString());

        JsonNode templateIdNode = templateNode.path("templateMeta").path("templateId");
        if (templateIdNode.isMissingNode()) {
            log.info("Reverting changes!");
            throw new BadRequestException("Template ID not found in payload!");
        }
        ReportTemplateHistory templateHistory = (ReportTemplateHistory) reportTemplateHistoryRepository.findByTemplateIdAndVersionNo(templateIdNode.asString(), version).orElseThrow(() -> new TemplateNotFoundException(templateIdNode.asString()));
        String variants = templateHistory.getVariantsJson();

        ReportTemplate rollbackedTemplate = reportTemplateRepository.findFirstByReportId(targetId)
                .orElseThrow(() -> new TemplateNotFoundException(templateIdNode.asString()));
        rollbackedTemplate.setVersionNo(templateHistory.getVersionNo());
        rollbackedTemplate.setTemplateJson(templateHistory.getTemplateJson());
        rollbackedTemplate.setCreatedAt(templateHistory.getCreatedAt());
        rollbackedTemplate.setCreatedBy(templateHistory.getCreatedBy());
        rollbackedTemplate.setCreatedFrom(templateHistory.getVersionNo());
        rollbackedTemplate.setRemarks(Optional.ofNullable(templateHistory.getRemarks()).orElse("")+ "[" + payload.getRemarks() + "]");

        deleteVariants(templateIdNode.asString());
        List<VariantDto> variantList = jsonMapper.readValue(variants, new TypeReference<ArrayList<VariantDto>>() {
        });

        saveVariants(templateIdNode.asString(), variantList, request, now);
        log.info("Rollbacked Template Successfully!");

        return List.of(rollbackedTemplate.getTemplateId());
    }


    private List<String> handleDelete(TemplateRequest request) {
        String targetId = request.getTargetId();
        if (!StringUtils.hasText(targetId)) {
            throw new BadRequestException("targetId required for DELETE");
        }

        LocalDateTime now = LocalDateTime.now(IST_ZONE);
        ReportTemplate template = reportTemplateRepository.findFirstByReportId(targetId).orElseThrow(() -> new TemplateNotFoundException("Template not found for reportId: " + targetId));

        String templateId = template.getTemplateId();

        archiveTemplate(template, request.getExecutorId(), now);
        deleteVariants(templateId);
        reportTemplateRepository.delete(template);

        return List.of(templateId);
    }

    private List<String> handleStatusChange(TemplateRequest request) {
        TemplateStatusRequest payload = jsonMapper.readValue(request.getPayload(), TemplateStatusRequest.class);
        String targetId = request.getTargetId();
        if (!StringUtils.hasText(targetId)) {
            throw new BadRequestException("targetId required for DELETE");
        }

        LocalDateTime now = LocalDateTime.now(IST_ZONE);
        ReportTemplate template = reportTemplateRepository.findFirstByReportId(targetId).orElseThrow(() -> new TemplateNotFoundException("Template not found for reportId: " + targetId));
        template.setStatus(payload.getStatus().name());
        reportTemplateRepository.save(template);

        return List.of(template.getTemplateId());
    }

    @Transactional
    private void archiveTemplate(ReportTemplate template, String archivedBy, LocalDateTime archivedAt) {
        String variantsSnapshot = fetchVariantsAsJson(template.getTemplateId());
        if (reportTemplateHistoryRepository.findByTemplateIdAndVersionNo(template.getTemplateId(), template.getVersionNo()).isPresent()) {
            return;
        }
        ReportTemplateHistory history = ReportTemplateHistory.builder().templateId(template.getTemplateId()).versionNo(template.getVersionNo()).reportId(template.getReportId()).templateName(template.getTemplateName()).description(template.getDescription()).status("INACTIVE").templateJson(template.getTemplateJson()).variantsJson(variantsSnapshot).createdBy(template.getCreatedBy()).createdAt(template.getCreatedAt()).archivedBy(archivedBy).archivedAt(archivedAt).remarks(template.getRemarks()).build();
        reportTemplateHistoryRepository.save(history);
    }

    private String fetchVariantsAsJson(String templateId) {
//        try {
//            List<ReportVariant> variants = variantRepository.findByTemplateId(templateId);
//            List<VariantDto> dtos = new ArrayList<>();
//            for (ReportVariant variant : variants) {
//                List<VariantParamDef> params = paramRepository.findByVariantIdIn(List.of(variant.getVariantId()));
//                List<FilterRule> rules = filterRuleRepository.findByVariantIdIn(List.of(variant.getVariantId()));
//
//                VariantDto dto = VariantDto.builder()
//                        .variantCode(variant.getVariantCode())
//                        .variantName(variant.getVariantName())
//                        .description(variant.getDescription())
//                        .status(variant.getStatus())
//                        .params(params.stream().map(p -> VariantParamDto.builder()
//                                .paramName(p.getParamName())
//                                .label(p.getLabel())
//                                .paramType(p.getParamType())
//                                .required("Y".equalsIgnoreCase(p.getRequired()))
//                                .multiValued("Y".equalsIgnoreCase(p.getMultiVal()))
//                                .uiHint(p.getUiHint())
//                                .validation(p.getValidation())
//                                .build()).toList())
//                        .filterRules(rules.stream().map(r -> FilterRuleDto.builder()
//                                .dbColumn(r.getDbColumn())
//                                .operator(r.getOperator())
//                                .paramName(r.getParamName())
//                                .scopeType(r.getScopeType())
//                                .scopeValue(r.getScopeValue())
//                                .build()).toList())
//                        .build();
//                dtos.add(dto);
//            }
//            return jsonMapper.writeValueAsString(dtos);
//        } catch (Exception ex) {
//            log.error("Failed to fetch variants snapshot for templateId={}", templateId, ex);
//            return "[]";
//        }
        try {
            return jsonMapper.writeValueAsString(fetchVariantsAsDtos(templateId));
        } catch (Exception ex) {
            log.error("Failed to fetch variants snapshot for templateId={}", templateId, ex);
            return "[]";
        }
    }

    private void saveVariants(TemplatePayload payload, ReportTemplate template, TemplateRequest request, LocalDateTime now) {
        if (payload.getVariants() == null) {
            return;
        }

        for (VariantDto variantDto : payload.getVariants()) {
            ReportVariant variant = ReportVariant.builder().templateId(template.getTemplateId()).variantCode(variantDto.getVariantCode()).variantName(variantDto.getVariantName()).description(variantDto.getDescription()).status(variantDto.getStatus()).createdAt(now).createdBy(request.getCreatorId()).updatedAt(now).updatedBy(request.getExecutorId()).build();

            ReportVariant savedVariant = variantRepository.saveAndFlush(variant);

            if (variantDto.getParams() != null) {
                for (VariantParamDto paramDto : variantDto.getParams()) {
                    VariantParamDef param = VariantParamDef.builder().reportVariant(savedVariant).paramName(paramDto.getParamName()).label(paramDto.getLabel()).paramType(paramDto.getParamType()).required(paramDto.isRequired() ? "Y" : "N").multiVal(paramDto.isMultiValued() ? "Y" : "N").uiHint(paramDto.getUiHint()).validation(paramDto.getValidation()).createdAt(now).build();
                    paramRepository.save(param);
                }
            }

            if (variantDto.getFilterRules() != null) {
                for (FilterRuleDto ruleDto : variantDto.getFilterRules()) {
                    FilterRule filterRule = FilterRule.builder().reportVariant(savedVariant).dbColumn(ruleDto.getDbColumn()).operator(ruleDto.getOperator()).paramName(ruleDto.getParamName()).scopeType(ruleDto.getScopeType()).scopeValue(ruleDto.getScopeValue()).createdAt(now).build();
                    filterRuleRepository.save(filterRule);
                }
            }
        }
    }

    private void saveVariants(String templateId, List<VariantDto> variants, TemplateRequest request, LocalDateTime now) {
        for (VariantDto variantDto : variants) {
            ReportVariant variant = ReportVariant.builder().templateId(templateId).variantCode(variantDto.getVariantCode()).variantName(variantDto.getVariantName()).description(variantDto.getDescription()).status(variantDto.getStatus()).createdAt(now).createdBy(request.getCreatorId()).updatedAt(now).updatedBy(request.getExecutorId()).build();

            ReportVariant savedVariant = variantRepository.saveAndFlush(variant);

            if (variantDto.getParams() != null) {
                for (VariantParamDto paramDto : variantDto.getParams()) {
                    VariantParamDef param = VariantParamDef.builder().reportVariant(savedVariant).paramName(paramDto.getParamName()).label(paramDto.getLabel()).paramType(paramDto.getParamType()).required(paramDto.isRequired() ? "Y" : "N").multiVal(paramDto.isMultiValued() ? "Y" : "N").uiHint(paramDto.getUiHint()).validation(paramDto.getValidation()).createdAt(now).build();
                    paramRepository.save(param);
                }
            }

            if (variantDto.getFilterRules() != null) {
                for (FilterRuleDto ruleDto : variantDto.getFilterRules()) {
                    FilterRule filterRule = FilterRule.builder().reportVariant(savedVariant).dbColumn(ruleDto.getDbColumn()).operator(ruleDto.getOperator()).paramName(ruleDto.getParamName()).scopeType(ruleDto.getScopeType()).scopeValue(ruleDto.getScopeValue()).createdAt(now).build();
                    filterRuleRepository.save(filterRule);
                }
            }
        }
    }


    private void deleteVariants(String templateId) {
        List<ReportVariant> variants = variantRepository.findByTemplateId(templateId);
        if (variants.isEmpty()) {
            return;
        }

        for (ReportVariant variant : variants) {
            Long variantId = variant.getVariantId();
            paramRepository.deleteByVariantId(variantId);
            filterRuleRepository.deleteByVariantId(variantId);
            variantRepository.delete(variant);
        }

        paramRepository.flush();
        filterRuleRepository.flush();
        variantRepository.flush();
    }

    private String serialize(Object obj) {
        try {
            return jsonMapper.writeValueAsString(obj);
        } catch (JacksonException e) {
            throw new BadRequestException("Failed to serialize template json");
        }
    }

    private TemplateRequestSummaryDto mapToSummaryDto(TemplateRequest request) {
        Map<String, String> summary = new HashMap<>();
        try {
            JsonNode root = jsonMapper.readTree(request.getPayload());
            JsonNode templateMeta = root.path("template").path("templateMeta");
            JsonNode reportMeta = root.path("template").path("reportMeta");
            summary.put("templateId", text(templateMeta, "templateId"));
            summary.put("reportId", text(reportMeta, "reportId"));
            summary.put("version", text(templateMeta, "version"));
            summary.put("reportName", text(reportMeta, "reportName"));
            summary.put("remarks", text(root, "remarks"));
            if (!text(root, "status").isEmpty()) {
                summary.put("newStatus", text(root, "status"));
            }
        } catch (Exception e) {
            log.warn("Unable to parse request payload for summary. reqId={}", request.getReqId(), e);
            summary = Map.of();
        }

        return TemplateRequestSummaryDto.builder().id(request.getReqId()).changeType(request.getChangeType()).reqStatus(request.getReqStatus()).reqDate(request.getReqDate()).creatorId(request.getCreatorId()).targetId(request.getTargetId()).remarks(request.getRemarks()).executionDate(request.getExecutionDate()).executorId(request.getExecutorId()).executorRemarks(request.getExecutorRemarks()).summary(summary).build();
    }

    private int parseVersion(String version) {
        if (!StringUtils.hasText(version)) {
            return 1;
        }
        try {
            return Integer.parseInt(version.trim());
        } catch (NumberFormatException ex) {
            return 1;
        }
    }

    private String text(JsonNode node, String field) {
        JsonNode val = node.path(field);
        return val.isMissingNode() || val.isNull() ? "" : val.asText("");
    }

    @Override
    @Transactional
    public TemplateRequest updateStatus(TemplateStatusRequest statusRequest, String token, String creatorId) {
        businessSecurityService.validateUserAction(token, ChangeType.UPDATE);
        String targetId = statusRequest.getTargetId();
        List<TemplateRequest> duplicates = templateRequestRepository.findByTargetIdAndReqStatusAndChangeType(targetId, RequestStatus.PENDING, ChangeType.STATUS);
        if (!duplicates.isEmpty()) {
            throw new DataIntegrityViolationException("A pending request for this template status change already exists.");
        }

        TemplateRequest newRequest = TemplateRequest.builder()
                .creatorId(creatorId)
                .changeType(ChangeType.STATUS)
                .reqStatus(RequestStatus.PENDING)
                .reqDate(LocalDateTime.now(IST_ZONE))
                .payload(jsonMapper.writeValueAsString(statusRequest))
                .targetId(targetId)
                .remarks(statusRequest.getRemarks()).
                build();
        return templateRequestRepository.save(newRequest);
    }


    @Override
    @Transactional
    public TemplateRequest rollbackTemplate(TemplateRollbackRequestDto request, String token, String creatorId) {
        businessSecurityService.validateUserAction(token, ChangeType.ROLLBACK);
        String targetId = request.getTargetId();
        List<TemplateRequest> duplicates = templateRequestRepository.findByTargetIdAndReqStatus(targetId, RequestStatus.PENDING);
        if (!duplicates.isEmpty()) {
            throw new DataIntegrityViolationException("A pending request for this template already exists.");
        }
        TemplateRequest newRequest = TemplateRequest.builder()
                .creatorId(creatorId)
                .changeType(ChangeType.ROLLBACK)
                .reqStatus(RequestStatus.PENDING)
                .reqDate(LocalDateTime.now(IST_ZONE))
                .payload(jsonMapper.writeValueAsString(request))
                .targetId(targetId)
                .remarks(request.getRemarks()).
                build();
        return templateRequestRepository.save(newRequest);
    }

    @Override
    public String getRequestTemplate(long requestId) {
       TemplateRequest request= templateRequestRepository.findById(requestId).get();
       return request.getPayload();
    }

//    @Override
//    @Transactional
//    public void cancelRequest(long requestId, String token, String executorId) {
//        businessSecurityService.validateUserAction(token, ChangeType.ROLLBACK);
//        TemplateRequest request= (TemplateRequest) templateRequestRepository.findById(requestId).orElseThrow();
//        if(!request.getCreatorId().equals(executorId)){
//          throw new BadRequestException("A user can't cancel another user's request!");
//        }
//        request.setReqStatus(RequestStatus.CANCELLED);
//    }


}






















package com.fincore.TemplateConfigurationService.service.impl;

import com.fincore.TemplateConfigurationService.cache.ReportBuilderCacheEvictor;
import com.fincore.TemplateConfigurationService.dto.*;
import com.fincore.TemplateConfigurationService.entity.*;
import com.fincore.TemplateConfigurationService.enums.TemplateStatus;
import com.fincore.TemplateConfigurationService.exception.BadRequestException;
import com.fincore.TemplateConfigurationService.exception.TemplateNotFoundException;
import com.fincore.TemplateConfigurationService.repository.*;
import com.fincore.TemplateConfigurationService.service.TemplateService;
import com.fincore.TemplateConfigurationService.validator.TemplatePayloadValidator;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

import tools.jackson.core.type.TypeReference;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;


@Slf4j
@Service
@RequiredArgsConstructor
public class TemplateServiceImpl implements TemplateService {

    private final ReportTemplateRepository templateRepository;
    private final ReportVariantRepository variantRepository;
    private final VariantParamDefRepository paramRepository;
    private final FilterRuleRepository filterRuleRepository;
    private final ReportTemplateHistoryRepository reportTemplateHistoryRepository;
    private final TemplatePayloadValidator payloadValidator;
    private final JsonMapper jsonMapper;
    private final ReportBuilderCacheEvictor cacheEvictor;

    // ========================================================================
    // SAVE TEMPLATE (CREATE OR UPDATE - FULL PAYLOAD)
    // ========================================================================

@Override
@Transactional
public ReportTemplate createOrUpdateTemplate(TemplatePayload payload, String userId) {
    TemplatePayload.Template meta = payload.getTemplate();
    String reportId = meta.getReportMeta().getReportId();

    if (reportId == null || reportId.isEmpty()) {
        throw new BadRequestException("Report ID is required");
    }

    int incomingVersion = Integer.parseInt(meta.getTemplateMeta().getVersion());
    LocalDateTime now = LocalDateTime.now();

    // 1. Serialize template JSON
    String templateJson;
    try {
        templateJson = jsonMapper.writeValueAsString(meta);
    } catch (Exception e) {
        throw new BadRequestException("Failed to serialize template json");
    }

    // 2. Determine Versioning Logic
    Optional<ReportTemplate> existingOpt = templateRepository.findFirstByReportIdAndStatus(reportId, "ACTIVE");
    ReportTemplate targetTemplate;
    boolean isNewVersion = false;
    String previousTemplateId = null;

    if (existingOpt.isPresent()) {
        ReportTemplate existing = existingOpt.get();

        if (incomingVersion > existing.getVersionNo()) {
            // SCENARIO: NEW VERSION - Deactivate old, create a fresh record
            previousTemplateId = existing.getTemplateId();
            existing.setStatus("INACTIVE");
            existing.setUpdatedAt(now);
            existing.setUpdatedBy(userId);
            templateRepository.save(existing);

            targetTemplate = new ReportTemplate();
            targetTemplate.setCreatedAt(now);
            targetTemplate.setCreatedBy(userId);
            isNewVersion = true;
        } else if (incomingVersion == existing.getVersionNo()) {
            // SCENARIO: SAME VERSION - Update the existing ACTIVE record
            targetTemplate = existing;
        } else {
            throw new BadRequestException("Incoming version (" + incomingVersion +
                    ") must be greater than or equal to current version (" + existing.getVersionNo() + ")");
        }
    } else {
        // INITIAL CREATION
        targetTemplate = new ReportTemplate();
        targetTemplate.setCreatedAt(now);
        targetTemplate.setCreatedBy(userId);
        isNewVersion = true;
    }

    // 3. Save Template Data
    targetTemplate.setTemplateName(meta.getReportMeta().getReportName());
    targetTemplate.setDescription(meta.getTemplateMeta().getDescription());
    targetTemplate.setVersionNo(incomingVersion);
    targetTemplate.setStatus("ACTIVE");
    targetTemplate.setTemplateJson(templateJson);
    //log.info("template json :: {}", templateJson);
    targetTemplate.setReportId(reportId);
    targetTemplate.setUpdatedAt(now);
    targetTemplate.setUpdatedBy(userId);

    ReportTemplate savedTemplate = templateRepository.save(targetTemplate);
    log.info("Template Id after save: {}", savedTemplate.getTemplateId());
    String currentTemplateId = savedTemplate.getTemplateId();

    // 4. Sync Variants and Params
    // If it's the SAME version, we update by variantCode.
    // If it's a NEW version, we treat every variant as a new record linked to the new templateId.
    Map<String, ReportVariant> existingVariantMap = new HashMap<>();
    if (!isNewVersion) {
        existingVariantMap = variantRepository.findByTemplateId(currentTemplateId)
                .stream().collect(Collectors.toMap(ReportVariant::getVariantCode, v -> v));
    }

    for (VariantDto dto : payload.getVariants()) {
        ReportVariant variant;

        // Logic: Use existing record if updating same version, otherwise create new row
        if (!isNewVersion && existingVariantMap.containsKey(dto.getVariantCode())) {
            variant = existingVariantMap.get(dto.getVariantCode());
        } else {
            variant = new ReportVariant();
            variant.setTemplateId(currentTemplateId); // Links to the NEW template record
            variant.setVariantCode(dto.getVariantCode());
            variant.setCreatedAt(now);
            variant.setCreatedBy(userId);
        }

        variant.setVariantName(dto.getVariantName());
        variant.setDescription(dto.getDescription());
//        variant.setStatus(dto.getStatus());
        if (dto.getStatus() != null && !dto.getStatus().isBlank()) {
            variant.setStatus(dto.getStatus());
        } else if (variant.getStatus() == null) {
            variant.setStatus("ACTIVE");
        }
        variant.setUpdatedAt(now);
        variant.setUpdatedBy(userId);

        ReportVariant savedVariant = variantRepository.saveAndFlush(variant);
        Long variantId = savedVariant.getVariantId();

        // 5. Update Params & Rules (Always refresh child lists for the current variant row)
        paramRepository.deleteByVariantId(variantId);
        filterRuleRepository.deleteByVariantId(variantId);

        if (dto.getParams() != null) {
            for (VariantParamDto p : dto.getParams()) {
                paramRepository.save(VariantParamDef.builder()
                        .reportVariant(savedVariant)
                        .paramName(p.getParamName())
                        .label(p.getLabel())
                        .paramType(p.getParamType())
                        .required(p.isRequired() ? "Y" : "N")
                        .multiVal(p.isMultiValued() ? "Y" : "N")
                        .uiHint(p.getUiHint())
                        .validation(p.getValidation())
                        .createdAt(now)
                        .build());
            }
        }

        if (dto.getFilterRules() != null) {
            for (FilterRuleDto r : dto.getFilterRules()) {
                filterRuleRepository.save(FilterRule.builder()
                        .reportVariant(savedVariant)
                        .dbColumn(r.getDbColumn())
                        .operator(r.getOperator())
                        .paramName(r.getParamName())
                        .scopeType(r.getScopeType())
                        .scopeValue(r.getScopeValue())
                        .createdAt(now)
                        .build());
            }
        }
    }

    // -----------------------------
    // 6. DELETE REMOVED VARIANTS
    // -----------------------------
    // 6. Cleanup removed variants (Only for in-place updates)
    if (!isNewVersion) {
        Set<String> incomingCodes = payload.getVariants().stream()
                .map(VariantDto::getVariantCode).collect(Collectors.toSet());

        existingVariantMap.values().stream()
                .filter(v -> !incomingCodes.contains(v.getVariantCode()))
                .forEach(v -> {
                    paramRepository.deleteByVariantId(v.getVariantId());
                    filterRuleRepository.deleteByVariantId(v.getVariantId());
                    variantRepository.delete(v);
                });
    }

    // 7. Evict Report Builder's Redis cache now that the save committed cleanly
    cacheEvictor.evictReportBuilderCache(currentTemplateId);
    if (previousTemplateId != null) {
        cacheEvictor.evictReportBuilderCache(previousTemplateId);
    }

    return savedTemplate;
}


    // ========================================================================
    // GET ALL TEMPLATES (WITH VARIANTS)
    // ========================================================================
    @Override
    @Transactional(readOnly = true)
    public List<TemplateResponse> getAllTemplates() {

        List<ReportTemplate> templates = templateRepository.findAll();
        if (templates.isEmpty()) return List.of();

        List<String> templateIds = templates.stream()
                .map(ReportTemplate::getTemplateId)
                .toList();

        List<ReportVariant> variants = variantRepository.findByTemplateIdIn(templateIds);

        Map<String, List<ReportVariant>> variantMap =
                variants.stream().collect(Collectors.groupingBy(ReportVariant::getTemplateId));

        List<Long> variantIds = variants.stream()
                .map(ReportVariant::getVariantId)
                .toList();

        Map<Long, List<VariantParamDef>> paramMap =
                paramRepository.findByVariantIdIn(variantIds)
                        .stream().collect(Collectors.groupingBy(def -> def.getReportVariant().getVariantId()));

        Map<Long, List<FilterRule>> ruleMap =
                filterRuleRepository.findByVariantIdIn(variantIds)
                        .stream().collect(Collectors.groupingBy(rule -> rule.getReportVariant().getVariantId()));

        return templates.stream().map(t -> TemplateResponse.builder()
                .templateId(t.getTemplateId())
                .reportId(t.getReportId())
                .templateName(t.getTemplateName())
                .description(t.getDescription())
                .status(t.getStatus())
                .versionNo(t.getVersionNo())
                .variants(
                        variantMap.getOrDefault(t.getTemplateId(), List.of())
                                .stream()
                                .map(v -> mapVariant(v,
                                        paramMap.getOrDefault(v.getVariantId(), List.of()),
                                        ruleMap.getOrDefault(v.getVariantId(), List.of())))
                                .toList()
                )
                .build()
        ).toList();
    }

    // ========================================================================
    // GET TEMPLATE BY ID
    // ========================================================================
    @Override
    @Transactional(readOnly = true)
    public TemplateResponse getTemplateWithVariants(String templateId) throws JacksonException {

        ReportTemplate template = templateRepository.findById(templateId)
                .orElseThrow(() -> new TemplateNotFoundException(templateId));

        List<ReportVariant> variants = variantRepository.findByTemplateId(templateId);

        List<Long> variantIds = variants.stream()
                .map(ReportVariant::getVariantId)
                .toList();

        Map<Long, List<VariantParamDef>> paramMap =
                paramRepository.findByVariantIdIn(variantIds)
                        .stream().collect(Collectors.groupingBy(def -> def.getReportVariant().getVariantId()));

        Map<Long, List<FilterRule>> ruleMap =
                filterRuleRepository.findByVariantIdIn(variantIds)
                        .stream().collect(Collectors.groupingBy(rule -> rule.getReportVariant().getVariantId()));

        JsonMapper mapper = new JsonMapper();
        Map<String, Object> templateJsonMap = mapper.readValue(template.getTemplateJson(), new TypeReference<Map<String, Object>>() {});

        return TemplateResponse.builder()
                .templateId(template.getTemplateId())
                .templateName(template.getTemplateName())
                .description(template.getDescription())
                .status(template.getStatus())
                .versionNo(template.getVersionNo())
                .template(templateJsonMap)
                .variants(
                        variants.stream()
                                .map(v -> mapVariant(v,
                                        paramMap.getOrDefault(v.getVariantId(), List.of()),
                                        ruleMap.getOrDefault(v.getVariantId(), List.of())))
                                .toList()
                )
                .build();
    }

    // ========================================================================
    // DELETE TEMPLATE
    // ========================================================================
    @Override
    @Transactional
    public void deleteTemplate(String templateId) {

        ReportTemplate template = templateRepository.findById(templateId)
                .orElseThrow(() -> new TemplateNotFoundException(templateId));

        clearAllVariants(templateId);
        templateRepository.delete(template);

        log.info("Template {} deleted", templateId);
    }


    // ========================================================================
    // GET TEMPLATE VERSIONS
    // ========================================================================
    @Override
    public List<TemplateVersion> getTemplateVersions(String templateId) {
        return reportTemplateHistoryRepository.findByTemplateIdOrderByVersionNoDesc(templateId);
    }


    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    private void clearAllVariants(String templateId) {
        List<ReportVariant> variants = variantRepository.findByTemplateId(templateId);

        if(variants.isEmpty()){
            return;
        }
        for (ReportVariant v : variants) {
            paramRepository.deleteByVariantId(v.getVariantId());
            filterRuleRepository.deleteByVariantId(v.getVariantId());
        }
        variantRepository.deleteAll(variants);
    }

    private void insertVariants(String templateId, List<VariantDto> variants,
                                LocalDateTime now, String userId) {

        if (variants == null) return;

        for (VariantDto dto : variants) {

            ReportVariant variant = ReportVariant.builder()
                    .templateId(templateId)
                    .variantCode(dto.getVariantCode())
                    .variantName(dto.getVariantName())
                    .description(dto.getDescription())
                    .status(dto.getStatus())
                    .createdAt(now)
                    .createdBy(userId)
                    .updatedAt(now)
                    .updatedBy(userId)
                    .build();

            variant = variantRepository.saveAndFlush(variant);

            if (dto.getParams() != null) {
                for (VariantParamDto p : dto.getParams()) {
                    paramRepository.save(VariantParamDef.builder()
                            .reportVariant(variant)
                            .paramName(p.getParamName())
                            .label(p.getLabel())
                            .paramType(p.getParamType())
                            .required(p.isRequired() ? "Y" : "N")
                            .multiVal(p.isMultiValued() ? "Y" : "N")
                            .uiHint(p.getUiHint())
                            .validation(p.getValidation())
                            .createdAt(now)
                            .build());
                }
            }

            if (dto.getFilterRules() != null) {
                for (FilterRuleDto r : dto.getFilterRules()) {
                    filterRuleRepository.save(FilterRule.builder()
                            .reportVariant(variant)
                            .scopeType(r.getScopeType())
                            .paramName(r.getParamName())
                            .dbColumn(r.getDbColumn())
                            .operator(r.getOperator())
                            .createdAt(now)
                            .build());
                }
            }
        }
    }

    private TemplateResponse.VariantResponse mapVariant(
            ReportVariant v,
            List<VariantParamDef> params,
            List<FilterRule> rules) {

        return TemplateResponse.VariantResponse.builder()
                .variantCode(v.getVariantCode())
                .variantName(v.getVariantName())
                .description(v.getDescription())
                .status(v.getStatus())
                .params(params.stream().map(this::toParamDto).toList())
                .filterRules(rules.stream().map(this::toRuleDto).toList())
                .build();
    }

    private VariantParamDto toParamDto(VariantParamDef p) {
        return VariantParamDto.builder()
                .paramName(p.getParamName())
                .label(p.getLabel())
                .paramType(p.getParamType())
                .required("Y".equalsIgnoreCase(p.getRequired()))
                .multiValued("Y".equalsIgnoreCase(p.getMultiVal()))
                .uiHint(p.getUiHint())
                .validation(p.getValidation())
                .build();
    }

    private FilterRuleDto toRuleDto(FilterRule r) {
        return FilterRuleDto.builder()
                .scopeType(r.getScopeType())
                .scopeValue(r.getScopeValue())
                .paramName(r.getParamName())
                .dbColumn(r.getDbColumn())
                .operator(r.getOperator())
                .build();
    }

    private Map<String, Object> toJsonMap(String json) {
        try {
            return jsonMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }
}

