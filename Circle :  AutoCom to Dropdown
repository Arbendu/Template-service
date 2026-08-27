1. Add new state (near your existing entity state, ~line 610)

// Entity (Circle/Branch) State mapping
const [entity, setEntity] = useState(null); // Stores the selected object { code, name }
const [entityInputValue, setEntityInputValue] = useState("");
const [entityOptions, setEntityOptions] = useState([]);
const [isEntityLoading, setIsEntityLoading] = useState(false);

// >>> ADD: Circle dropdown state (separate from Branch's search-based entityOptions)
// circleOptions is cached for the dialog's lifetime so re-opening/reselecting
// "Circle" scope doesn't re-hit the API every time.
const [circleOptions, setCircleOptions] = useState([]);
const [isCircleOptionsLoading, setIsCircleOptionsLoading] = useState(false);









2. Replace the "ENTITY FETCHING & AUTO-FILL LOGIC" effect (original lines ~677–753)
Split it into a Branch-only search effect, plus a new Circle-preload effect:

// --- BRANCH ENTITY SEARCH LOGIC (unchanged behavior, Branch only now) ---
useEffect(() => {
  // Circle no longer uses debounced per-keystroke search — see the
  // CIRCLE OPTIONS PRELOAD effect below.
  if (!isBranchScope) return undefined;

  const delayDebounceFn = setTimeout(async () => {
    if (entityInputValue && entityInputValue.length >= 2) {
      setIsEntityLoading(true);
      try {
        const response = await callApi(
          `/CM/common-master/branches-code-name-only?q=${entityInputValue}&circleCode=`,
          {},
          "GET",
        );
        const data = response?.data || [];
        const mappedData = data.map((b) => ({ code: b.code, name: b.name }));
        setEntityOptions(mappedData);
      } catch (error) {
        console.error("Error fetching branch entities:", error);
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

// >>> ADD: CIRCLE OPTIONS PRELOAD (NEW)
// Fetches the FULL circle list once when Circle scope is selected, then
// caches it — the dropdown just displays this list on click, no search API calls.
useEffect(() => {
  if (!isCircleScope) return undefined;
  if (circleOptions.length > 0) return undefined; // already cached

  let isActive = true; // guards against setting state after unmount/scope switch
  const loadCircles = async () => {
    setIsCircleOptionsLoading(true);
    try {
      const response = await callApi(`/CM/common-master/circle-codes`, {}, "GET");
      const data = response?.data || [];
      const mappedData = data
        .map((c) => ({ code: c.circleCode, name: c.circleName }))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (isActive) setCircleOptions(mappedData);
    } catch (error) {
      console.error("Error fetching circle list:", error);
      if (isActive) setCircleOptions([]);
    } finally {
      if (isActive) setIsCircleOptionsLoading(false);
    }
  };

  loadCircles();
  return () => {
    isActive = false;
  };
}, [isCircleScope, callApi, circleOptions.length]);












3. Replace the conditional Autocomplete JSX block (original lines ~1087–1172)

{/* Branch → unchanged Autocomplete (search-as-you-type) */}
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

{/* >>> ADD: Circle → plain dropdown, shows ALL circles on click */}
{isCircleScope && (
  <FormControl size="small" fullWidth disabled={isApplying}>
    <InputLabel id="dialog-circle-label">Select Circle *</InputLabel>
    <Select
      labelId="dialog-circle-label"
      label="Select Circle *"
      value={entity?.code || ""}
      onChange={(e) => {
        const selected = circleOptions.find((c) => c.code === e.target.value);
        setEntity(selected || null);
      }}
      MenuProps={{ PaperProps: { style: { maxHeight: 320 } } }}
    >
      {/* Safety net: if a previously-saved circle isn't in the loaded list yet
          (e.g. dialog reopened before fetch completes), still show its label */}
      {entity?.code && !circleOptions.some((c) => c.code === entity.code) && (
        <MenuItem key={entity.code} value={entity.code}>
          {entity.code} - {entity.name}
        </MenuItem>
      )}

      {circleOptions.length === 0 && !isCircleOptionsLoading ? (
        <MenuItem disabled value="">
          No circles available
        </MenuItem>
      ) : (
        circleOptions.map((circle) => (
          <MenuItem key={circle.code} value={circle.code}>
            {circle.code} - {circle.name}
          </MenuItem>
        ))
      )}
    </Select>
    <FormHelperText
      sx={{ fontStyle: "italic", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px" }}
    >
      <InfoIcon sx={{ fontSize: "0.625rem" }} />
      {isCircleOptionsLoading ? "Loading circles..." : "Click to view all circles."}
    </FormHelperText>
  </FormControl>
)}
