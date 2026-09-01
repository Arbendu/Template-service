// DB Migration(Oracle)

ALTER TABLE DR_VIEW_DIMENSION ADD (IS_ARRAY_COLUMN NUMBER(1) DEFAULT 0 NOT NULL);

-- Mark HeadCode as array-typed across all views (rows you showed: ids 332-340)
UPDATE DR_VIEW_DIMENSION
SET IS_ARRAY_COLUMN = 1
WHERE LOGICAL_NAME = 'HeadCode';

-- Promote HeadCode to the root drill level for the Bank-level PNL view (view_id 56).
-- Bump whatever is currently at level 1 for that view out of the way first.
UPDATE DR_VIEW_DIMENSION SET DRILL_LEVEL = 2 WHERE VIEW_ID = 56 AND DRILL_LEVEL = 1;  -- e.g. Geography, was 1
UPDATE DR_VIEW_DIMENSION SET DRILL_LEVEL = 1 WHERE VIEW_ID = 56 AND LOGICAL_NAME = 'HeadCode';  -- was 90

COMMIT;





// model/DrViewDimension.java

@Column(name = "IS_ARRAY_COLUMN", nullable = false)
private boolean arrayColumn;




// dto/DimensionConfig.java


public record DimensionConfig(String physicalSql, boolean isExpression, boolean isArrayColumn) {}



// service/OracleMetadataProviderImpl.java — pass the new flag through (line ~1237):


dim -> new DimensionConfig(dim.getPhysicalColumn(), dim.isExpression(), dim.isArrayColumn())





// component/DruidQueryBuilder.java

public Map<String, Object> buildSqlPayload(
        String physicalTable,
        String logicalTargetDim,
        DimensionConfig targetDimConfig,
        List<String> logicalMetrics,
        Map<String, String> resolvedMetricsSql,
        List<FilterDto> filters,
        Map<String, DimensionConfig> dimensionTranslationMap) {

    StringBuilder sql = new StringBuilder("SELECT ");
    boolean groupingByArray = targetDimConfig.isArrayColumn();
    String unnestAlias = "unnested_" + logicalTargetDim;

    // 1. Grouping column - array-typed dimensions (e.g. HeadCode) must be UNNESTed
    // so Druid produces one row per array element instead of grouping by the raw array.
    if (groupingByArray) {
        sql.append("\"").append(unnestAlias).append("\".\"").append(logicalTargetDim).append("\" AS \"").append(logicalTargetDim).append("\"");
    } else {
        sql.append(formatDimension(targetDimConfig)).append(" AS \"").append(logicalTargetDim).append("\"");
    }

    // 2. Metrics - unchanged
    for (String logicalMetric : logicalMetrics) {
        String rawMetricSql = resolvedMetricsSql.get(logicalMetric);
        sql.append(", ").append(rawMetricSql).append(" AS \"").append(logicalMetric).append("\"");
    }

    // 3. From physical datasource (+ UNNEST join when grouping by an array column)
    sql.append(" FROM \"").append(physicalTable).append("\"");
    if (groupingByArray) {
        sql.append(", UNNEST(").append(formatDimension(targetDimConfig))
           .append(") AS \"").append(unnestAlias).append("\"(\"").append(logicalTargetDim).append("\")");
    }
    sql.append(" WHERE 1=1 ");

    // 4. Filters - unchanged in shape, still loops the same way
    List<Map<String, String>> parameters = new ArrayList<>();
    if (filters != null && !filters.isEmpty()) {
        for (FilterDto filter : filters) {
            DimensionConfig filterDimConfig = dimensionTranslationMap.get(filter.logicalField());
            if (filterDimConfig == null) {
                throw new IllegalArgumentException("Filter dimension not mapped: " + filter.logicalField());
            }
            appendFilterCondition(sql, parameters, filterDimConfig, filter);
        }
    }

    // 5. Group By
    if (groupingByArray) {
        sql.append(" GROUP BY \"").append(unnestAlias).append("\".\"").append(logicalTargetDim).append("\"");
    } else {
        sql.append(" GROUP BY ").append(formatDimension(targetDimConfig));
    }

    return Map.of("query", sql.toString(), "parameters", parameters);
}

private void appendFilterCondition(StringBuilder sql, List<Map<String, String>> parameters, DimensionConfig config, FilterDto filter) {
    String formattedDim = formatDimension(config);

    if ("EQUALS".equalsIgnoreCase(filter.operator())) {
        // CHANGED: was a hardcoded "HeadCode".equalsIgnoreCase(filter.logicalField()) check.
        // Now driven by the DB flag, so any future array-typed dimension works automatically.
        if (config.isArrayColumn()) {
            sql.append(" AND ARRAY_CONTAINS(").append(formattedDim).append(", ?) ");
        } else {
            sql.append(" AND ").append(formattedDim).append(" = ? ");
        }
        parameters.add(Map.of("type", "VARCHAR", "value", String.valueOf(filter.value())));
    } else {
        throw new IllegalArgumentException("Unsupported filter operator: " + filter.operator());
    }
}









