================================================================================
SUMMARY OF CHANGES
================================================================================

Goal: support 1..5 head codes in a single DrillDownRequest, executed as
independent Druid queries, returned grouped per head code — matching your
sample payload/response exactly.

Files changed:
  1. dto/Meta.java                      -> MODIFIED (added optional headCodeCount)
  2. util/HeadCodeFilterUtil.java       -> NEW (shared extraction/validation logic)
  3. service/SemanticDrillDownService.java -> MODIFIED (branch to multi head-code path)
  4. mock/MockDruidEngine.java          -> MODIFIED (ST env parity with prod behavior)

Files NOT changed (and why):
  - dto/FilterDto.java        -> value is already `Object`, so it transparently
                                  accepts either a scalar ("L102") or a List
                                  (["L102"] / ["L102","01160","10001"]). No change needed.
  - component/DruidQueryBuilder.java -> Not touched. Instead of teaching the SQL
                                  builder a new "IN" operator, each head code is
                                  run as its own EQUALS + ARRAY_CONTAINS query
                                  (the exact, already-reviewed code path you had).
                                  This is what lets the response come back
                                  *grouped per head code* instead of merged.

Request contract (matches your sample):
  Single head code:
    { "logicalField": "HeadCode", "operator": "IN", "value": ["L102"] }
  Multiple head codes (max 5, enforced server-side):
    { "logicalField": "HeadCode", "operator": "IN", "value": ["L012","01160","10001"] }

  The legacy scalar form { "operator": "EQUALS", "value": "L102" } still works
  (backward compatible) — it's treated as a one-element list.

Response contract (matches your sample):
  {
    "meta": { "status": "SUCCESS", "executionTimeMs": 1125, "headCodeCount": 3 },
    "data": [
      { "headCode": "L012", "headMeta": {...}, "headData": [...] },
      ...
    ]
  }
  Requests with NO HeadCode filter keep returning the old flat shape
  ({ "meta": {status, level, rowCount, executionTimeMs}, "data": [...] })
  unchanged — nothing breaks for existing callers that don't filter by head code.

Safety/security notes:
  - Head code count is capped at 5 server-side (HeadCodeFilterUtil.MAX_HEAD_CODES),
    independent of whatever the FE sends, to prevent a client from forcing N
    Druid queries per request.
  - Each head code is format-validated (^[a-zA-Z0-9_-]{1,50}$) before use.
    Values are still always sent to Druid as bind parameters (never
    string-concatenated), so this is defense-in-depth, not the primary
    injection guard.
  - A Druid failure for one head code is caught and reported as an "ERROR"
    headMeta entry instead of failing the entire multi head-code request.


================================================================================
1. dto/Meta.java  (MODIFIED)
================================================================================

package com.fincore.analyticsservice.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Response metadata.
 *
 * MODIFIED: added optional headCodeCount, populated ONLY for multi head-code
 * drill-down responses (see SemanticDrillDownService#executeMultiHeadCodeDrillDown).
 * It's omitted from the JSON body otherwise via @JsonInclude(NON_NULL), so the
 * existing single-head-code / non-HeadCode-filtered response shape is
 * byte-for-byte unchanged for current UI consumers.
 *
 * rowCount was widened from primitive int to Integer so the top-level
 * multi-head-code meta can omit it (it has no single meaning across N
 * per-head queries) without introducing a fake "rowCount": 0.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record Meta(
        String status,
        String level,
        Integer rowCount,
        long executionTimeMs,
        Integer headCodeCount
) {
    /**
     * Backward-compatible constructor kept for every existing call site
     * (single-query drill-down, mock engine, etc.) that doesn't deal with
     * multi head-code aggregation. headCodeCount defaults to null (omitted).
     */
    public Meta(String status, String level, Integer rowCount, long executionTimeMs) {
        this(status, level, rowCount, executionTimeMs, null);
    }
}


================================================================================
2. util/HeadCodeFilterUtil.java  (NEW)
================================================================================

package com.fincore.analyticsservice.util;

import com.fincore.analyticsservice.dto.FilterDto;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Shared helper for extracting and validating the "HeadCode" filter out of an
 * incoming DrillDownRequest. Used by both SemanticDrillDownService (real Druid
 * path) and MockDruidEngine (ST path) so the two stay behaviorally identical.
 *
 * Supported request shapes:
 *   - Multi-select (current FE contract): operator "IN", value is a List,
 *     e.g. ["L102"] for a single selection, or ["L012","01160","10001"].
 *   - Legacy scalar (backward compatible): operator "EQUALS", value is a
 *     bare String, e.g. "L102".
 */
public final class HeadCodeFilterUtil {

    public static final String HEAD_CODE_FIELD = "HeadCode";

    /** Matches the FilterDialog's multi-select chip limit on the frontend. */
    public static final int MAX_HEAD_CODES = 5;

    // Head codes are short alphanumeric identifiers. Values are ALWAYS bound as
    // JDBC/Druid parameters (never concatenated into SQL) - this pattern check
    // is defense-in-depth / early input validation, not the injection guard.
    private static final Pattern HEAD_CODE_PATTERN = Pattern.compile("^[a-zA-Z0-9_-]{1,50}$");

    private HeadCodeFilterUtil() {
        // static utility - no instances
    }

    /**
     * Finds the HeadCode filter in the given filter list, if present.
     */
    public static Optional<FilterDto> extractHeadCodeFilter(List<FilterDto> filters) {
        if (filters == null || filters.isEmpty()) {
            return Optional.empty();
        }
        return filters.stream()
                .filter(f -> HEAD_CODE_FIELD.equalsIgnoreCase(f.logicalField()))
                .findFirst();
    }

    /**
     * Normalizes and validates the head code(s) carried by a HeadCode filter,
     * regardless of whether the client sent a List (new contract) or a bare
     * scalar (legacy contract).
     *
     * @throws IllegalArgumentException if the filter is empty, exceeds
     *         MAX_HEAD_CODES, or contains a malformed head code value.
     */
    public static List<String> resolveHeadCodes(FilterDto headCodeFilter) {
        Object rawValue = headCodeFilter.value();
        List<String> headCodes;

        if (rawValue instanceof List<?> rawList) {
            headCodes = rawList.stream()
                    .filter(Objects::nonNull)
                    .map(String::valueOf)
                    .map(String::trim)
                    .filter(v -> !v.isEmpty())
                    .distinct() // defensively de-dupe repeated selections
                    .collect(Collectors.toList());
        } else if (rawValue != null) {
            // Legacy scalar value - treat as a single-element list.
            String single = String.valueOf(rawValue).trim();
            headCodes = single.isEmpty() ? List.of() : List.of(single);
        } else {
            headCodes = List.of();
        }

        if (headCodes.isEmpty()) {
            throw new IllegalArgumentException("HeadCode filter must contain at least one non-blank value.");
        }
        if (headCodes.size() > MAX_HEAD_CODES) {
            throw new IllegalArgumentException(
                    "A maximum of " + MAX_HEAD_CODES + " head codes can be selected per request.");
        }
        for (String code : headCodes) {
            if (!HEAD_CODE_PATTERN.matcher(code).matches()) {
                throw new IllegalArgumentException("Invalid head code format: " + code);
            }
        }
        return headCodes;
    }
}


================================================================================
3. service/SemanticDrillDownService.java  (MODIFIED - full file)
================================================================================

package com.fincore.analyticsservice.service;

import com.fincore.analyticsservice.client.DruidRestClient;
import com.fincore.analyticsservice.component.DruidQueryBuilder;
import com.fincore.analyticsservice.dto.*;
import com.fincore.analyticsservice.mock.MockDruidEngine;
import com.fincore.analyticsservice.util.HeadCodeFilterUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.util.*;
import java.util.stream.Collectors;

/**
 * The "Brain" of the Semantic Layer.
 * This service takes a "Logical" request from the frontend (e.g., "Give me the Total Balance for Branches"),
 * looks up the physical rules in Oracle, translates the request, enforces RBAC, and executes it.
 */
@Slf4j
@Service
public class SemanticDrillDownService {
    private static final Integer ROLE_ADMIN = 10;

    private final DruidRestClient druidRestClient;
    private final DruidQueryBuilder queryBuilder;
    private final ReportMetadataProvider metadataProvider;
    private final MockDruidEngine mockEngine;

    public SemanticDrillDownService(
            DruidRestClient druidRestClient,
            DruidQueryBuilder queryBuilder,
            ReportMetadataProvider metadataProvider, MockDruidEngine mockEngine) {
        this.druidRestClient = druidRestClient;
        this.queryBuilder = queryBuilder;
        this.metadataProvider = metadataProvider;
        this.mockEngine = mockEngine;
    }

    /**
     * Executes the Drill-Down operation. Cached to ensure identical clicks return instantly.
     *
     * MODIFIED: now branches into a multi head-code path whenever the incoming request carries a
     * "HeadCode" filter (single value OR array of up to {@link HeadCodeFilterUtil#MAX_HEAD_CODES}
     * values). Requests without a HeadCode filter fall through to the original single-query path
     * unchanged, so existing behavior is fully preserved.
     */
    @Cacheable(value = "drillDownData", key = "T(java.lang.String).valueOf(#request.hashCode())")
    public DrillDownResponse executeDrillDown(DrillDownRequest request, Integer roleId) {
        long startTime = System.currentTimeMillis();
        String logicalTargetDim = request.dimensions().getFirst();

        log.info("Executing DrillDown for view: [{}], logicalDim: [{}]", request.viewCode(), logicalTargetDim);

        // THE ST MOCK INTERCEPTOR
        // If the mock is enabled in application-st.yml, hijack the request and process in Java
        if (mockEngine.isMockEnabled()) {
            log.warn("=================> ROUTING REQUEST TO MOCK DRUID ENGINE FOR ST ENVIRONMENT <=================");
            return mockEngine.execute(request, request.filters());
        }

        // 1. Fetch Metadata context for this view from Oracle
        ViewMetadataContext context = metadataProvider.getViewContext(request.viewCode());

        // 2. Perform RBAC validation (Are they allowed to see this specific view?)
        validateAccess(context.requiredRoleIds(), roleId);

        // 3. Translate Logical to DimensionConfig (e.g., "Branch" -> "BRANCH_CODE")
        DimensionConfig targetDimConfig = translateDimension(logicalTargetDim, context.dimensionMap());
        Map<String, String> resolvedMetricsSql = resolveMetrics(request.metrics(), context.metricMap());

        // 4. NEW: detect a HeadCode filter (works for both the new IN/array contract
        //    and the legacy EQUALS/scalar contract - see HeadCodeFilterUtil).
        Optional<FilterDto> headCodeFilter = HeadCodeFilterUtil.extractHeadCodeFilter(request.filters());

        if (headCodeFilter.isPresent()) {
            return executeMultiHeadCodeDrillDown(
                    request, headCodeFilter.get(), context, targetDimConfig, resolvedMetricsSql,
                    logicalTargetDim, startTime);
        }

        // No HeadCode filter in this request -> original single-query behavior, untouched.
        return executeSingleQueryDrillDown(
                request, context, targetDimConfig, resolvedMetricsSql, logicalTargetDim, startTime);
    }

    /**
     * ORIGINAL behavior, extracted verbatim into its own method: builds one SQL payload for the
     * full filter set and executes a single Druid query. Used when there's no HeadCode filter.
     */
    private DrillDownResponse executeSingleQueryDrillDown(
            DrillDownRequest request,
            ViewMetadataContext context,
            DimensionConfig targetDimConfig,
            Map<String, String> resolvedMetricsSql,
            String logicalTargetDim,
            long startTime) {

        Map<String, Object> druidPayload = queryBuilder.buildSqlPayload(
                context.physicalDruidTable(),
                logicalTargetDim,
                targetDimConfig,
                request.metrics(),
                resolvedMetricsSql,
                request.filters(),
                context.dimensionMap()
        );

        log.info("Final druid payload to be executed: {}", druidPayload);

        List<Map<String, Object>> rawDruidData = druidRestClient.executeQuery(druidPayload);

        if (CollectionUtils.isEmpty(rawDruidData)) {
            return new DrillDownResponse(
                    new Meta("SUCCESS", logicalTargetDim, 0, System.currentTimeMillis() - startTime),
                    Collections.emptyList());
        }

        boolean hasChildren = determineIfHasChildren(logicalTargetDim, context.logicalHierarchyOrdered());
        List<Map<String, Object>> formattedData = formatResponseData(rawDruidData, logicalTargetDim, hasChildren);

        long executionTime = System.currentTimeMillis() - startTime;
        return new DrillDownResponse(new Meta("SUCCESS", logicalTargetDim, formattedData.size(), executionTime), formattedData);
    }

    /**
     * NEW: Executes one Druid query PER head code and returns the results grouped by head code,
     * matching the agreed response contract:
     *
     * {
     *   "meta": { "status": "SUCCESS", "executionTimeMs": ..., "headCodeCount": N },
     *   "data": [
     *     { "headCode": "L012", "headMeta": {status, level, rowCount, executionTimeMs}, "headData": [...] },
     *     ...
     *   ]
     * }
     *
     * Each head code is queried independently (rather than folded into one SQL IN/ARRAY_OVERLAP
     * clause) because the UI needs numbers broken out per head code, not merged into one bucket.
     * A Druid failure on one head code is isolated (reported as an "ERROR" headMeta) instead of
     * failing the entire multi head-code request.
     */
    private DrillDownResponse executeMultiHeadCodeDrillDown(
            DrillDownRequest request,
            FilterDto headCodeFilter,
            ViewMetadataContext context,
            DimensionConfig targetDimConfig,
            Map<String, String> resolvedMetricsSql,
            String logicalTargetDim,
            long overallStartTime) {

        // Validates: non-empty, <= MAX_HEAD_CODES, alphanumeric format.
        // Throws IllegalArgumentException (-> 400 via your existing exception handler) otherwise.
        List<String> headCodes = HeadCodeFilterUtil.resolveHeadCodes(headCodeFilter);

        log.info("Executing multi head-code DrillDown for view: [{}], logicalDim: [{}], headCodes: {}",
                request.viewCode(), logicalTargetDim, headCodes);

        boolean hasChildren = determineIfHasChildren(logicalTargetDim, context.logicalHierarchyOrdered());
        List<Map<String, Object>> perHeadResults = new ArrayList<>(headCodes.size());

        for (String headCode : headCodes) {
            long headStartTime = System.currentTimeMillis();

            // Every other filter (ReportDate, Circle, etc.) is reused as-is. The HeadCode filter
            // is swapped for a single-value EQUALS filter so DruidQueryBuilder's existing,
            // already-reviewed ARRAY_CONTAINS(dim, ?) bind-parameter logic handles it unchanged -
            // no changes needed in DruidQueryBuilder at all.
            List<FilterDto> perHeadFilters = request.filters().stream()
                    .map(f -> HeadCodeFilterUtil.HEAD_CODE_FIELD.equalsIgnoreCase(f.logicalField())
                            ? new FilterDto(HeadCodeFilterUtil.HEAD_CODE_FIELD, "EQUALS", headCode)
                            : f)
                    .collect(Collectors.toList());

            // LinkedHashMap to guarantee key order in the JSON output: headCode, headMeta, headData.
            Map<String, Object> headResult = new LinkedHashMap<>();
            headResult.put("headCode", headCode);

            try {
                Map<String, Object> druidPayload = queryBuilder.buildSqlPayload(
                        context.physicalDruidTable(),
                        logicalTargetDim,
                        targetDimConfig,
                        request.metrics(),
                        resolvedMetricsSql,
                        perHeadFilters,
                        context.dimensionMap()
                );

                log.debug("Druid payload for headCode [{}]: {}", headCode, druidPayload);

                List<Map<String, Object>> rawDruidData = druidRestClient.executeQuery(druidPayload);
                List<Map<String, Object>> formattedData = CollectionUtils.isEmpty(rawDruidData)
                        ? Collections.emptyList()
                        : formatResponseData(rawDruidData, logicalTargetDim, hasChildren);

                long headExecutionTime = System.currentTimeMillis() - headStartTime;
                headResult.put("headMeta", new Meta("SUCCESS", logicalTargetDim, formattedData.size(), headExecutionTime));
                headResult.put("headData", formattedData);

            } catch (Exception ex) {
                // Isolate per-head-code failures - one bad/slow head code must not fail the whole batch.
                log.error("Druid query failed for headCode [{}] on view [{}]", headCode, request.viewCode(), ex);
                long failedTime = System.currentTimeMillis() - headStartTime;
                headResult.put("headMeta", new Meta("ERROR", logicalTargetDim, 0, failedTime));
                headResult.put("headData", Collections.emptyList());
            }

            perHeadResults.add(headResult);
        }

        long totalExecutionTime = System.currentTimeMillis() - overallStartTime;
        // Top-level meta intentionally omits "level"/"rowCount" (passed as null here; @JsonInclude
        // (NON_NULL) on Meta drops null fields from the JSON) to match the agreed contract exactly:
        // { "status": ..., "executionTimeMs": ..., "headCodeCount": ... }
        Meta overallMeta = new Meta("SUCCESS", null, null, totalExecutionTime, headCodes.size());

        return new DrillDownResponse(overallMeta, perHeadResults);
    }

    /**
     * Validates if the user's integer role ID is permitted to view this report.
     * @param requiredRoleIds A comma-separated string from DB (e.g., "54,56"). Null means public.
     * @param roleId The user's actual role ID from JWT.
     */
    private void validateAccess(String requiredRoleIds, Integer roleId) {

        // Admin always has access to everything
        if (ROLE_ADMIN.equals(roleId)) {
            return;
        }

        // If DB has no restrictions, allow access to all the roles
        if (requiredRoleIds == null || requiredRoleIds.trim().isEmpty() || "NULL".equalsIgnoreCase(requiredRoleIds.trim())) {
            return;
        }

        // Parse comma-separated list and check for match
        List<String> allowedRoles = Arrays.asList(requiredRoleIds.split(","));

        if (!allowedRoles.contains(String.valueOf(roleId))) {
            log.warn("Security Alert: User with Role ID [{}] attempted to access restricted view requiring roles [{}]", roleId, requiredRoleIds);
            throw new AccessDeniedException("Insufficient permissions to execute drill-down for this view.");
        }
    }

    private DimensionConfig translateDimension(String logicalName, Map<String, DimensionConfig> dimMap) {
        DimensionConfig config = dimMap.get(logicalName);
        if (config == null) {
            throw new IllegalArgumentException("Logical dimension '" + logicalName + "' is not supported in this view.");
        }
        return config;
    }

    private Map<String, String> resolveMetrics(List<String> logicalMetrics, Map<String, String> metricMap) {
        Map<String, String> resolved = new HashMap<>();
        for (String logicalName : logicalMetrics) {
            String sqlExpression = metricMap.get(logicalName);
            if (sqlExpression == null || sqlExpression.isBlank()) {
                throw new IllegalArgumentException("Logical metric '" + logicalName + "' is not supported in this view.");
            }
            resolved.put(logicalName, sqlExpression);
        }
        return resolved;
    }

    private boolean determineIfHasChildren(String currentDim, List<String> hierarchy) {
        int index = hierarchy.indexOf(currentDim);
        return index != -1 && index < hierarchy.size() - 1;
    }

    private List<Map<String, Object>> formatResponseData(List<Map<String, Object>> rawData, String logicalDim, boolean hasChildren) {
        String idPrefix = logicalDim.toLowerCase() + "_";
        List<Map<String, Object>> result = new ArrayList<>(rawData.size());

        for (Map<String, Object> row : rawData) {
            Map<String, Object> formattedRow = new LinkedHashMap<>();

            // Safe extraction because the QueryBuilder AS aliased the complex expression back to the simple logicalDim string
            Object nameObj = row.get(logicalDim);
            String nameValue = (nameObj != null && !nameObj.toString().isBlank()) ? nameObj.toString() : "Unassigned";

            formattedRow.put("id", idPrefix + nameValue.toLowerCase().replaceAll("[^a-z0-9]", "_"));
            formattedRow.put("name", nameValue);

            for (Map.Entry<String, Object> entry : row.entrySet()) {
                if (!entry.getKey().equals(logicalDim)) {
                    formattedRow.put(entry.getKey(), entry.getValue() == null ? 0.0 : entry.getValue());
                }
            }
            formattedRow.put("hasChildren", hasChildren);
            result.add(formattedRow);
        }
        return result;
    }
}


================================================================================
4. mock/MockDruidEngine.java  (MODIFIED - full file)
================================================================================

package com.fincore.analyticsservice.mock;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.fincore.analyticsservice.dto.DrillDownRequest;
import com.fincore.analyticsservice.dto.DrillDownResponse;
import com.fincore.analyticsservice.dto.FilterDto;
import com.fincore.analyticsservice.dto.Meta;
import com.fincore.analyticsservice.util.HeadCodeFilterUtil;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Slf4j
@Service
public class MockDruidEngine {

    private final JsonMapper jsonMapper;
    @Value("${app.mock.druid.enabled:false}")
    private boolean mockEnabled;
    private List<Map<String, Object>> mockData = new ArrayList<>();

    public MockDruidEngine(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    @PostConstruct
    public void init() {
        if (!mockEnabled) {
            log.info("Mock Druid Engine is DISABLED. Routing to real Apache Druid.");
            return;
        }

        try {
            log.warn("⏳ ST ENVIRONMENT MOCK DETECTED: Loading mock_druid_data.json into memory...");
            InputStream is = new ClassPathResource("report.json").getInputStream();

            JsonNode rootNode = jsonMapper.readTree(is);
            if (rootNode.isObject() && rootNode.has("rows")) {
                mockData = jsonMapper.convertValue(rootNode.get("rows"), new TypeReference<List<Map<String, Object>>>() {
                });
            } else if (rootNode.isArray()) {
                mockData = jsonMapper.convertValue(rootNode, new TypeReference<List<Map<String, Object>>>() {
                });
            }

            log.info("✅ Mock Data Loaded Successfully. Total Rows in RAM: {}", mockData.size());
        } catch (Exception e) {
            log.error("❌ Failed to load mock data. Make sure report.json is in src/main/resources!", e);
        }
    }

    public boolean isMockEnabled() {
        return mockEnabled;
    }

    /**
     * MODIFIED: now branches into a multi head-code path for ST testing parity with the real
     * SemanticDrillDownService. Requests without a HeadCode filter run through the original
     * aggregation logic unchanged (see runAggregation).
     */
    public DrillDownResponse execute(DrillDownRequest request, List<FilterDto> securedFilters) {
        Optional<FilterDto> headCodeFilterOpt = HeadCodeFilterUtil.extractHeadCodeFilter(securedFilters);

        if (headCodeFilterOpt.isPresent()) {
            return executeMultiHeadCode(request, headCodeFilterOpt.get(), securedFilters);
        }

        return runAggregation(request, securedFilters, System.currentTimeMillis());
    }

    /**
     * NEW: Mirrors SemanticDrillDownService#executeMultiHeadCodeDrillDown for the mock engine -
     * runs the aggregation once per head code and returns the same grouped response shape.
     */
    private DrillDownResponse executeMultiHeadCode(DrillDownRequest request, FilterDto headCodeFilter, List<FilterDto> securedFilters) {
        long overallStart = System.currentTimeMillis();
        List<String> headCodes = HeadCodeFilterUtil.resolveHeadCodes(headCodeFilter);

        List<Map<String, Object>> perHeadResults = new ArrayList<>(headCodes.size());

        for (String headCode : headCodes) {
            // Swap the HeadCode filter for a single scalar value; matchesFilters() already
            // handles a scalar String value correctly, so no changes needed there.
            List<FilterDto> perHeadFilters = securedFilters.stream()
                    .map(f -> HeadCodeFilterUtil.HEAD_CODE_FIELD.equalsIgnoreCase(f.logicalField())
                            ? new FilterDto(HeadCodeFilterUtil.HEAD_CODE_FIELD, "EQUALS", headCode)
                            : f)
                    .collect(Collectors.toList());

            DrillDownResponse single = runAggregation(request, perHeadFilters, System.currentTimeMillis());

            Map<String, Object> headResult = new LinkedHashMap<>();
            headResult.put("headCode", headCode);
            headResult.put("headMeta", single.meta());
            headResult.put("headData", single.data());
            perHeadResults.add(headResult);
        }

        long totalTime = System.currentTimeMillis() - overallStart;
        Meta overallMeta = new Meta("SUCCESS", null, null, totalTime, headCodes.size());
        return new DrillDownResponse(overallMeta, perHeadResults);
    }

    /**
     * ORIGINAL aggregation logic, extracted verbatim into its own method so it can be reused
     * both for the single-query path and once-per-head-code in the multi head-code path.
     */
    private DrillDownResponse runAggregation(DrillDownRequest request, List<FilterDto> securedFilters, long startTime) {
        String targetDim = request.dimensions().get(0);

        Map<String, BigDecimal> groupedData = new HashMap<>();

        mockData.stream()
                .filter(row -> matchesFilters(row, securedFilters, request.viewCode()))
                .forEach(row -> {
                    String groupKey = extractDimensionValue(row, targetDim);
                    if (groupKey == null || groupKey.trim().isEmpty() || "null".equals(groupKey)) {
                        return;
                    }

                    Object balanceObj = row.get("BALANCE");
                    BigDecimal balance = balanceObj != null ? new BigDecimal(String.valueOf(balanceObj)) : BigDecimal.ZERO;
                    groupedData.merge(groupKey, balance, BigDecimal::add);
                });

        List<Map<String, Object>> responseData = groupedData.entrySet().stream()
                .map(entry -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", targetDim.toLowerCase() + "_" + entry.getKey().replaceAll("[^a-zA-Z0-9]", ""));
                    map.put("name", entry.getKey());
                    map.put("AMOUNT", entry.getValue().setScale(2, RoundingMode.HALF_UP));
                    map.put("hasChildren", true);
                    return map;
                })
                .sorted((a, b) -> {
                    if ("Branch-Circle".equalsIgnoreCase(targetDim)) {
                        String nameA = (String) a.get("name");
                        String nameB = (String) b.get("name");

                        if (nameA == null) return 1;
                        if (nameB == null) return -1;

                        String[] partsA = nameA.split(" - ", 2);
                        String[] partsB = nameB.split(" - ", 2);

                        if (partsA.length == 2 && partsB.length == 2) {
                            String branchA = partsA[0].trim();
                            String circleA = partsA[1].trim();
                            String branchB = partsB[0].trim();
                            String circleB = partsB[1].trim();

                            int circleCompare = circleA.compareToIgnoreCase(circleB);
                            if (circleCompare != 0) {
                                return circleCompare;
                            }
                            return branchA.compareToIgnoreCase(branchB);
                        }
                        return nameA.compareToIgnoreCase(nameB);
                    } else {
                        BigDecimal amountA = (BigDecimal) a.get("AMOUNT");
                        BigDecimal amountB = (BigDecimal) b.get("AMOUNT");
                        if (amountA == null) amountA = BigDecimal.ZERO;
                        if (amountB == null) amountB = BigDecimal.ZERO;
                        return amountB.compareTo(amountA);
                    }
                })
                .collect(Collectors.toList());

        long timeTaken = System.currentTimeMillis() - startTime;
        log.info("Mock Engine aggregated {} groups in {} ms for view [{}]", responseData.size(), timeTaken, request.viewCode());

        Meta meta = new Meta("SUCCESS", targetDim, responseData.size(), timeTaken);
        return new DrillDownResponse(meta, responseData);
    }

    private boolean matchesFilters(Map<String, Object> row, List<FilterDto> filters, String viewCode) {
        if (filters == null || filters.isEmpty()) return true;

        for (FilterDto f : filters) {
            String val = String.valueOf(f.value());

            switch (f.logicalField()) {
                case "ReportDate":
                    if (!val.equals(String.valueOf(row.get("DATE")))) return false;
                    break;
                case "HeadCode":
                    String headCol = viewCode.startsWith("YSA") ? "YSA_HEADCODE" :
                            viewCode.startsWith("PNL") ? "PNL_HEADCODE" : "NWSA_HEADCODE";
                    Object arrayData = row.get(headCol);
                    if (arrayData == null || !arrayData.toString().contains(val)) return false;
                    break;
                case "Circle":
                    if (!val.equals(String.valueOf(row.get("CIRCLE_CODE")))) return false;
                    break;

                case "Branch":
                case "Branch-Circle":
                case "BranchCode":
                    if (!val.equals(String.valueOf(row.get("BRANCH_CODE")))) return false;
                    break;
                case "Geography":
                    String geo = "D".equals(row.get("BRANCH_TYPE")) ? "Domestic" : "Foreign";
                    if (!val.equals(geo)) return false;
                    break;
                case "CGL":
                    if (!val.equals(String.valueOf(row.get("CGL")))) return false;
                    break;
                case "Product":
                    if (!val.equals(String.valueOf(row.get("PRODUCT")))) return false;
                    break;
            }
        }
        return true;
    }

    private String extractDimensionValue(Map<String, Object> row, String targetDim) {
        switch (targetDim) {
            case "Geography":
                return "D".equals(row.get("BRANCH_TYPE")) ? "Domestic" : "Foreign";
            case "CGL":
                return String.valueOf(row.get("CGL"));
            case "Product":
                return String.valueOf(row.get("PRODUCT"));
            case "Branch-Circle":
                return row.get("BRANCH_CODE") + " - " + row.get("CIRCLE_NAME");
            default:
                return null;
        }
    }
}


================================================================================
NOTES / THINGS TO DOUBLE-CHECK ON YOUR SIDE
================================================================================

1. @Cacheable key on executeDrillDown uses request.hashCode(). DrillDownRequest
   is a record whose FilterDto.value() is Object — a List's hashCode() is
   well-defined and order-sensitive, so caching still works correctly for both
   ["L102"] and ["L102","01160"], but ["L012","01160"] and ["01160","L012"]
   will cache as DIFFERENT keys (order matters). Sort the head codes on the FE
   before sending if you want those to hit the same cache entry.

2. Whatever global exception handler you have mapping IllegalArgumentException
   -> 400 Bad Request will now also catch the new validation errors from
   HeadCodeFilterUtil.resolveHeadCodes() (empty list, >5 head codes, bad format).
   Confirm your @ControllerAdvice already covers IllegalArgumentException (it
   already did for translateDimension/resolveMetrics, so this should be fine).

3. com.fasterxml.jackson.annotation.JsonInclude is used in Meta.java. That's
   the jackson-annotations package, which keeps its classic com.fasterxml
   namespace even in Jackson 3.x (only jackson-core/-databind moved to
   tools.jackson.*) — matches the tools.jackson.databind.ObjectMapper import
   you're already using elsewhere in RedisConfig.
