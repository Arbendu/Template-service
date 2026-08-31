1. api/analyticsApi.js
Insert new helper right after buildBaseFilters (after line 116, before fetchInitialData at line 118):


// Merges a multi-head response (array of {headCode, headData}) into one
// row-per-dimension list. Each row carries a headValues Map keyed by headCode
// (Map avoids prototype-pollution risk from a server-supplied string key).
// Falls back to treating a legacy flat-row response as a single head.
const mergeHeadRows = (apiData, metrics, fallbackHeadCode) => {
  const list = Array.isArray(apiData) ? apiData : [];
  const isMultiHeadShape =
    list.length > 0 && Object.prototype.hasOwnProperty.call(list[0], "headData");

  const pickMetricValues = (row) => {
    const values = {};
    metrics.forEach((m) => {
      values[m.logicalName] = row?.[m.logicalName];
    });
    return values;
  };

  if (!isMultiHeadShape) {
    return list.map((row) => ({
      id: row?.id || row?.name,
      name: row?.name,
      hasChildren: Boolean(row?.hasChildren),
      headValues: new Map([[fallbackHeadCode, pickMetricValues(row)]]),
    }));
  }

  const rowMap = new Map();
  list.forEach((headEntry) => {
    const headCode = headEntry?.headCode;
    if (!headCode) return;
    (headEntry.headData || []).forEach((row) => {
      const rowKey = row?.id || row?.name;
      if (!rowKey) return;
      if (!rowMap.has(rowKey)) {
        rowMap.set(rowKey, {
          id: rowKey,
          name: row.name,
          hasChildren: false,
          headValues: new Map(),
        });
      }
      const mergedRow = rowMap.get(rowKey);
      mergedRow.hasChildren = mergedRow.hasChildren || Boolean(row.hasChildren);
      mergedRow.headValues.set(headCode, pickMetricValues(row));
    });
  });

  return Array.from(rowMap.values()).sort((a, b) =>
    (a.name || "").localeCompare(b.name || ""),
  );
};










//  Replace lines 118–141 (fetchInitialData):

export const fetchInitialData = async (
  callApi,
  showSnackBar,
  appliedFilters,
  hierarchy,
  metrics,
) => {
  const rootDimension = hierarchy[0];
  const headCodes = (appliedFilters.heads || [])
    .map((h) => h?.headCode)
    .filter(Boolean);

  const payload = {
    viewCode: appliedFilters.viewCode,
    dimensions: [rootDimension],
    metrics: metrics.map((m) => m.logicalName),
    filters: buildBaseFilters(appliedFilters),
  };

  const apiData = await fetchAnalyticsData(callApi, showSnackBar, payload);
  const mergedRows = mergeHeadRows(apiData, metrics, headCodes[0]);

  return mergedRows.map((row) => ({
    ...row,
    level: 0,
    nodeFilters: [],
    id: `root_${row.name || row.id}`,
  }));
};










// Replace lines 143–178 (fetchChildrenData):


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
  const headCodes = (appliedFilters.heads || [])
    .map((h) => h?.headCode)
    .filter(Boolean);

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
    dimensions: [nextDimension],
    metrics: metrics.map((m) => m.logicalName),
    filters: [...buildBaseFilters(appliedFilters), ...currentFilters],
  };

  const apiData = await fetchAnalyticsData(callApi, showSnackBar, payload);
  const mergedRows = mergeHeadRows(apiData, metrics, headCodes[0]);

  return mergedRows.map((row) => ({
    ...row,
    level: childLevel,
    nodeFilters: currentFilters,
    id: `${parentNode.id}_${row.name || row.id}`,
  }));
};












2. components/ActualTreeTableRow.jsx
Line 208 — add a prop with a safe default:

activeMetrics,
        activeHeads = [],   // ADD THIS LINE
        theme,





// Lines 351–353 — replace:

const metricHeaders = activeHeads.flatMap((head) =>
                                activeMetrics.map(
                                  (m) => `${head.headCode} ${m.displayName || m.logicalName}`,
                                ),
                              );





// Lines 372–383 — replace the metrics mapping inside traverse:

const metrics = activeHeads.flatMap((head) =>
                                  activeMetrics.map((m) => {
                                    const value = currentNode.headValues?.get(
                                      head.headCode,
                                    )?.[m.logicalName];
                                    if (value === null || value === undefined)
                                      return "";
                                    return !isNaN(value)
                                      ? Number(value).toFixed(2)
                                      : value;
                                  }),
                                );










// Lines 514–543 — replace the metric-cell render block:

{activeHeads.flatMap((head) =>
            activeMetrics.map((metric) => {
              const value = node.headValues?.get(head.headCode)?.[metric.logicalName];
              return (
                <TableCell
                  key={`${head.headCode}_${metric.logicalName}`}
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
            }),
          )}










components/FilterDialog.jsx — circle → dropdown
Delete lines 712–765 (the combined circle/branch autocomplete-fetch effect) and replace with two effects:



// --- CIRCLE FETCHING: full list once, no search needed for a dropdown ---
  useEffect(() => {
    if (!isCircleScope) return;
    let isCancelled = false;
    const fetchCircles = async () => {
      setIsEntityLoading(true);
      try {
        const response = await callApi(`/CM/common-master/circle-codes`, {}, "GET");
        const data = response?.data || [];
        const mappedData = data.map((c) => ({
          code: c.circleCode,
          name: c.circleName,
        }));
        if (!isCancelled) setEntityOptions(mappedData);
      } catch (error) {
        console.error("Error fetching circles:", error);
        if (!isCancelled) setEntityOptions([]);
      } finally {
        if (!isCancelled) setIsEntityLoading(false);
      }
    };
    fetchCircles();
    return () => {
      isCancelled = true;
    };
  }, [isCircleScope, callApi]);

  // --- BRANCH FETCHING: unchanged, debounced, search-as-you-type ---
  useEffect(() => {
    if (!isBranchScope) return;
    const delayDebounceFn = setTimeout(async () => {
      if (entityInputValue && entityInputValue.length >= 2) {
        setIsEntityLoading(true);
        try {
          const response = await callApi(
            `/CM/common-master/branches-code-name-only?q=${encodeURIComponent(
              entityInputValue,
            )}&circleCode=`,
            {},
            "GET",
          );
          const data = response?.data || [];
          setEntityOptions(data.map((b) => ({ code: b.code, name: b.name })));
        } catch (error) {
          console.error("Error fetching branches:", error);
          setEntityOptions([]);
        } finally {
          setIsEntityLoading(false);
        }
      } else {
        setEntityOptions(entity ? [entity] : []);
      }
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [entityInputValue, isBranchScope, callApi, entity]);











// Delete lines 1201–1277 (the combined {(isCircleScope || isBranchScope) && <Autocomplete .../>} block) and replace with:

{/* Circle scope: dropdown listing every circle */}
          {isCircleScope && (
            <FormControl size="small" fullWidth disabled={isApplying}>
              <InputLabel id="dialog-entity-circle-label">Select Circle *</InputLabel>
              <Select
                labelId="dialog-entity-circle-label"
                label="Select Circle *"
                value={entity?.code || ""}
                onChange={(e) => {
                  const selected = entityOptions.find((o) => o.code === e.target.value);
                  setEntity(selected || null);
                }}
                renderValue={(selectedCode) => {
                  const selected = entityOptions.find((o) => o.code === selectedCode);
                  return selected ? `${selected.code} - ${selected.name}` : "";
                }}
              >
                {isEntityLoading ? (
                  <MenuItem disabled value="">
                    Loading circles...
                  </MenuItem>
                ) : entityOptions.length === 0 ? (
                  <MenuItem disabled value="">
                    No circles available
                  </MenuItem>
                ) : (
                  entityOptions.map((option) => (
                    <MenuItem key={option.code} value={option.code}>
                      {option.code} - {option.name}
                    </MenuItem>
                  ))
                )}
              </Select>
              <FormHelperText
                sx={{
                  fontStyle: "italic",
                  fontSize: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  lineHeight: 1.5,
                }}
              >
                <InfoIcon sx={{ fontSize: "0.625rem" }} />
                Select a circle from the list.
              </FormHelperText>
            </FormControl>
          )}

          {/* Branch scope: unchanged search Autocomplete */}
          {isBranchScope && (
            <Autocomplete
              key="branch"
              size="small"
              autoHighlight
              options={entityOptions}
              sx={{
                "& .MuiAutocomplete-popupIndicator": { backgroundColor: "transparent" },
                "& .MuiAutocomplete-popupIndicator:hover": { backgroundColor: "transparent" },
              }}
              noOptionsText={
                entityInputValue.length >= 2 && !isEntityLoading
                  ? "No match found"
                  : "Type at least 2 characters..."
              }
              inputValue={entityInputValue}
              value={entity}
              getOptionLabel={(option) => (option ? `${option.code} - ${option.name}` : "")}
              onChange={(event, newValue) => setEntity(newValue)}
              onInputChange={(event, newInputValue, reason) => {
                if (reason === "reset") return;
                const filteredValue = newInputValue
                  .replace(/[^a-zA-Z0-9 ]/g, "")
                  .replace(/\s{2,}/g, " ");
                if (filteredValue !== entityInputValue) {
                  setEntityInputValue(filteredValue);
                }
              }}
              loading={isEntityLoading}
              disabled={isApplying}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search Branch Code *"
                  variant="outlined"
                  inputProps={{
                    ...params.inputProps,
                    onPaste: handlePaste,
                    autoComplete: "off",
                    maxLength: 50,
                  }}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <React.Fragment>
                        {isEntityLoading ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </React.Fragment>
                    ),
                  }}
                  helperText={
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <InfoIcon sx={{ fontSize: "0.625rem" }} />
                      <em>Type at least 2 alphanumeric characters to search.</em>
                    </span>
                  }
                />
              )}
            />
          )}











4. ReportAnalysisScreen.jsx
Line 1935: head: null, → heads: [],
Line 1970: appliedFilters.head && → (appliedFilters.heads?.length > 0) &&
Line 2109 replace:

const headsKey = (appliedFilters.heads || [])
            .map((h) => h.headCode)
            .sort()
            .join("-");
          const filterHash = `${appliedFilters.viewCode}_${appliedFilters.entityCode}_${headsKey}_${appliedFilters.reportDate}`;






Line 2252: head: null, → heads: [],
Lines 2211–2213 replace:

const totalColumnsCount =
    visibleHierarchyLevels.length +
    (appliedFilters.heads || []).length * activeHierarchyConfig.availableMetrics.length;




Lines 2448–2467 replace the metric header cells:

{(appliedFilters.heads || []).flatMap((head) =>
                    activeHierarchyConfig.availableMetrics.map((metric) => (
                      <TableCell
                        key={`${head.headCode}_${metric.logicalName}`}
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
                        {head.headCode} · {metric.displayName}
                      </TableCell>
                    )),
                  )}









Line ~2495, add the new prop when rendering ActualTreeTableRow:

activeMetrics={activeHierarchyConfig.availableMetrics}
                      activeHeads={appliedFilters.heads || []}   // ADD THIS LINE














components/ReportAnalysisHeader.jsx
Lines 1544–1548 replace:

const headDisplay =
    Array.isArray(appliedFilters?.heads) && appliedFilters.heads.length > 0
      ? appliedFilters.heads.map((h) => h.headCode).join(", ")
      : appliedFilters?.headCode ||
        appliedFilters?.searchHeadCode ||
        "None Selected";






Lines 1567–1570's typeof headDisplay === "object" fallback can stay untouched — it still covers any legacy single-head object.)
