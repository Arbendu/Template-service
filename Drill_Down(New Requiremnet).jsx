1. api/analyticsApi.js
fetchAnalyticsData — delete the isMultiHead branch entirely (the response is a plain flat array again, just like before the compare-table detour). Replace the whole function body with:




  export const fetchAnalyticsData = async (callApi, showSnackBar, payload) => {
  try {
    console.log("Drill-down payload: ", payload);
    const responseData = await callApi(
      "/AS/analytics/drill-down",
      payload,
      "POST",
    );
    const result = responseData?.data;
    const sortedList = [...(result || [])].sort((a, b) =>
      (a.name || "").localeCompare(b.name || ""),
    );
    return sortedList;
  } catch (error) {
    console.error("Error fetching analytics data:", error);
    showSnackBar("Error: " + error?.title || "Failed to fetch data", "error");
    return [];   // hardening: never let downstream .map() run on undefined
  }
};








Delete the mergeHeadRows helper I gave you last time — it's no longer needed. Add this small helper in its place instead:


const extractHeadCodes = (appliedFilters) =>
  (appliedFilters.heads || []).map((h) => h?.headCode).filter(Boolean);








buildBaseFilters — remove the HeadCode filter block entirely (it moves to a top-level headCodes field now, per the new contract). Replace the function with:


const buildBaseFilters = (appliedFilters) => {
  const formattedDate = formatDateToDDMMYYYY(appliedFilters.reportDate);

  const filters = [
    {
      logicalField: "ReportDate",
      operator: "EQUALS",
      value: formattedDate,
    },
  ];

  if (appliedFilters.entityCode) {
    const isCircleScope = appliedFilters.viewCode.includes("CIRCLE");
    const isBranchScope = appliedFilters.viewCode.includes("BRANCH");

    if (isCircleScope) {
      filters.push({
        logicalField: "Circle",
        operator: "EQUALS",
        value: appliedFilters.entityCode,
      });
    } else if (isBranchScope) {
      filters.push({
        logicalField: "BranchCode",
        operator: "EQUALS",
        value: appliedFilters.entityCode,
      });
    }
  }

  return filters;
};












fetchInitialData — replace with (note: rows are plain again — no headValues merging):


export const fetchInitialData = async (
  callApi,
  showSnackBar,
  appliedFilters,
  hierarchy,
  metrics,
) => {
  const rootDimension = hierarchy[0]; // now "HeadCode" per the updated config
  const payload = {
    viewCode: appliedFilters.viewCode,
    headCodes: extractHeadCodes(appliedFilters),
    dimensions: [rootDimension],
    metrics: metrics.map((m) => m.logicalName),
    filters: buildBaseFilters(appliedFilters),
  };

  const apiData = await fetchAnalyticsData(callApi, showSnackBar, payload);

  return (apiData || []).map((row) => ({
    ...row,
    level: 0,
    nodeFilters: [],
    id: `root_${row.name || row.id}`,
  }));
};












fetchChildrenData — replace with (same as original generic drill-down, just adds headCodes at the top level so it's carried on every subsequent request, per the contract's "leave headCodes exactly as it was" rule):


export const fetchChildrenData = async (
  callApi,
  showSnackBar,
  parentNode,
  appliedFilters,
  hierarchy,
  metrics,
) => {
  const childLevel = parentNode.level + 1;
  const nextDimension = hierarchy[childLevel];

  const currentFilters = [
    ...(parentNode.nodeFilters || []),
    {
      logicalField: hierarchy[parentNode.level],
      operator: "EQUALS",
      value: parentNode.name,
    },
  ];

  const payload = {
    viewCode: appliedFilters.viewCode,
    headCodes: extractHeadCodes(appliedFilters),
    dimensions: [nextDimension],
    metrics: metrics.map((m) => m.logicalName),
    filters: [...buildBaseFilters(appliedFilters), ...currentFilters],
  };

  const apiData = await fetchAnalyticsData(callApi, showSnackBar, payload);

  return (apiData || []).map((row) => ({
    ...row,
    level: childLevel,
    nodeFilters: currentFilters,
    id: `${parentNode.id}_${row.name || row.id}`,
  }));
};











2. components/ActualTreeTableRow.jsx — revert to single value per metric
Remove the activeHeads = [] prop you added to the destructured props list.
Replace the metric-cell block (the activeHeads.flatMap(...) version) back 


                               
{activeMetrics.map((metric) => {
            const value = node[metric.logicalName];
            return (
              <TableCell
                key={metric.logicalName}
                align="right"
                style={{
                  borderRight: `1px solid ${theme.palette.divider}`,
                  borderBottom: `1px solid ${theme.palette.divider}`,
                  color:
                    value < 0
                      ? theme.palette.error.main
                      : theme.palette.success.main,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  verticalAlign: "middle",
                  fontSize: "0.875rem",
                  fontFamily:
                    theme.typography.fontFamily ||
                    "Roboto, Helvetica, Arial, sans-serif",
                }}
              >
                {formatCurrency(value)}
              </TableCell>
            );
          })}














3. ReportAnalysisScreen.jsx — revert the compare-table rendering
Table header: revert the (appliedFilters.heads || []).flatMap(...) block back to a plain single loop:


{activeHierarchyConfig.availableMetrics.map((metric) => (
                    <TableCell
                      key={metric.logicalName}
                      align="right"
                      sx={{
                        backgroundColor:
                          theme.palette.purple?.[200] ||
                          theme.palette.primary.light,
                        color: "text.primary",
                        fontWeight: 700,
                        borderRight: 1,
                        borderColor: "divider",
                        borderBottom: 2,
                        py: 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {metric.displayName}
                    </TableCell>
                  ))}











totalColumnsCount: revert to

const totalColumnsCount =
    visibleHierarchyLevels.length +
    activeHierarchyConfig.availableMetrics.length;






ActualTreeTableRow usage: remove the activeHeads={appliedFilters.heads || []} line you added.
