// RightPanel.jsx

import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { useDebouncedInput } from "../../hooks/useDebouncedInput";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Autocomplete from "@mui/material/Autocomplete";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { FormulaBuilder } from "../editor/FormulaBuilder";
import { DynamicRowConfig } from "../editor/DynamicRowConfig";
import { FilterBuilder } from "../editor/FilterBuilder";
import { useTableConfig } from "../../hooks/useTableConfig";
import { useAppDispatch, useAppSelector } from "../../store";
import {
  updateCell,
  updateCellRender,
  updateCellFormat,
  updateCellSource,
  updateDynamicConfig,
  setFormulaMode,
} from "../../store/templateSlice";
import {
  selectSelectedCell,
  selectFormulaMode,
  selectRowsEntities,
  selectCellsEntities,
  selectColumns,
  selectTemplateColumns,
  selectTemplateForExport,
  selectSelectedColumn,
} from "../../store/selectors";

export const RightPanel = memo(() => {
  const dispatch = useAppDispatch();
  const { tableConfigs, getSelectableColumns, getAllowedAggFuncs } =
    useTableConfig();

  const selectedCell = useAppSelector(selectSelectedCell);
  const formulaMode = useAppSelector(selectFormulaMode);
  const rows = useAppSelector(selectRowsEntities);
  const cells = useAppSelector(selectCellsEntities);
  const columns = useAppSelector(selectColumns);
  const templateColumns = useAppSelector(selectTemplateColumns);
  const templateForExport = useAppSelector(selectTemplateForExport);
  const selectedColumn = useAppSelector(selectSelectedColumn);

  const [cellTypeWarning, setCellTypeWarning] = useState(null);
  const [expandedPanels, setExpandedPanels] = useState({
    cellType: true,
    dbSource: true,
    formatting: true,
    cellFormat: true,
  });

  const handleExpand = useCallback((panel) => {
    setExpandedPanels((prev) => ({ ...prev, [panel]: !prev[panel] }));
  }, []);

  const row = selectedCell ? rows[selectedCell.rowId] : null;
  const cell = selectedCell ? cells[selectedCell.cellId] : null;
  const column = selectedColumn;

  // Memoize handlers to prevent recreating on every render
  const handleUpdateCell = useCallback(
    (field, value) => {
      if (!selectedCell || !cell) return;

      if (field.startsWith("render.")) {
        const renderField = field.replace("render.", "");
        dispatch(
          updateCellRender({
            cellId: selectedCell.cellId,
            render: { [renderField]: value },
          }),
        );
      } else if (field.startsWith("format.")) {
        const formatField = field.replace("format.", "");
        dispatch(
          updateCellFormat({
            cellId: selectedCell.cellId,
            format: { [formatField]: value },
          }),
        );
      } else if (field.startsWith("source.")) {
        const sourceField = field.replace("source.", "");
        dispatch(
          updateCellSource({
            cellId: selectedCell.cellId,
            source: { [sourceField]: value },
          }),
        );
      } else {
        dispatch(
          updateCell({
            cellId: selectedCell.cellId,
            cell: { [field]: value },
          }),
        );
      }
    },
    [dispatch, selectedCell, cell],
  );

  // Stable debounced handler
  const handleTextValueChange = useCallback(
    (value) => {
      handleUpdateCell("value", value);
    },
    [handleUpdateCell],
  );

  const [debouncedTextValue, setDebouncedTextValue] = useDebouncedInput(
    cell?.value || "",
    handleTextValueChange,
    150,
  );

  // Only update debounced value when cell changes (not on every render)
  useEffect(() => {
    if (cell?.value !== debouncedTextValue) {
      setDebouncedTextValue(cell?.value || "");
    }
  }, [cell?.value, setDebouncedTextValue]); // removed debouncedTextValue from deps to avoid loop if handled elsewhere

  const handleFormulaModeChange = useCallback(
    (mode) => {
      dispatch(setFormulaMode(mode));
    },
    [dispatch],
  );

  const handleDynamicConfigChange = useCallback(
    (config) => {
      if (!selectedCell) return;
      dispatch(
        updateDynamicConfig({
          rowId: selectedCell.rowId,
          config,
        }),
      );
    },
    [dispatch, selectedCell],
  );

  useEffect(() => {
    // console.log("Heloooooo");
    setCellTypeWarning(null);
  }, [selectedCell?.cellId]); // Only reset when cell changes

  // Memoize selected table and columns
  const selectedTable = useMemo(
    () => cell?.source?.table || "",
    [cell?.source?.table],
  );
  const selectableColumns = useMemo(
    () => (selectedTable ? getSelectableColumns(selectedTable) : []),
    [selectedTable, getSelectableColumns],
  );

  const validateCellTypeForColumn = useCallback(
    (cellType, table, col) => {
      if (!table || !col) return true;
      if (!cellType.startsWith("DB_") || cellType === "DB_VALUE") return true;
      const aggFunc = cellType.replace("DB_", "");
      const allowedFuncs = getAllowedAggFuncs(table, col);
      return allowedFuncs.includes(aggFunc);
    },
    [getAllowedAggFuncs],
  );

  const handleCellTypeChange = useCallback(
    (newType) => {
      setCellTypeWarning(null);
      if (
        newType.startsWith("DB_") &&
        newType !== "DB_VALUE" &&
        selectedTable &&
        cell?.source?.column
      ) {
        const isAllowed = validateCellTypeForColumn(
          newType,
          selectedTable,
          cell.source.column,
        );
        if (!isAllowed) {
          setCellTypeWarning(
            `${newType} is not supported for column "${cell.source.column}". Please select a different column or cell type.`,
          );
        }
      }
      handleUpdateCell("type", newType);
    },
    [
      handleUpdateCell,
      selectedTable,
      cell?.source?.column,
      validateCellTypeForColumn,
    ],
  );

  const handleColumnChange = useCallback(
    (newColumn) => {
      handleUpdateCell("source.column", newColumn);
      const currentType = cell?.type;
      if (
        currentType &&
        currentType.startsWith("DB_") &&
        currentType !== "DB_VALUE" &&
        selectedTable &&
        newColumn
      ) {
        const isAllowed = validateCellTypeForColumn(
          currentType,
          selectedTable,
          newColumn,
        );
        if (!isAllowed) {
          setCellTypeWarning(
            `${currentType} is not supported for column "${newColumn}". Cell type has been reset to DB_VALUE.`,
          );
          handleUpdateCell("type", "DB_VALUE");
        } else {
          setCellTypeWarning(null);
        }
      }
    },
    [handleUpdateCell, cell?.type, selectedTable, validateCellTypeForColumn],
  );

  const getCellTypeOptions = useMemo(() => {
    const baseTypes = [
      { value: "TEXT", label: "Text" },
      { value: "DB_VALUE", label: "DB Value" },
      { value: "FORMULA", label: "Formula" },
    ];

    if (!selectedTable || !cell?.source?.column) {
      return [
        ...baseTypes,
        { value: "DB_COUNT", label: "DB Count" },
        { value: "DB_SUM", label: "DB Sum" },
        { value: "DB_AVG", label: "DB Average" },
        { value: "DB_MIN", label: "DB Min" },
        { value: "DB_MAX", label: "DB Max" },
      ];
    }

    const allowedAggFuncs = getAllowedAggFuncs(
      selectedTable,
      cell.source.column,
    );
    const aggTypes = [];
    if (allowedAggFuncs.includes("COUNT"))
      aggTypes.push({ value: "DB_COUNT", label: "DB Count" });
    if (allowedAggFuncs.includes("SUM"))
      aggTypes.push({ value: "DB_SUM", label: "DB Sum" });
    if (allowedAggFuncs.includes("AVG"))
      aggTypes.push({ value: "DB_AVG", label: "DB Average" });
    if (allowedAggFuncs.includes("MIN"))
      aggTypes.push({ value: "DB_MIN", label: "DB Min" });
    if (allowedAggFuncs.includes("MAX"))
      aggTypes.push({ value: "DB_MAX", label: "DB Max" });

    return [...baseTypes, ...aggTypes];
  }, [selectedTable, cell?.source?.column, getAllowedAggFuncs]);

  if (!selectedCell) {
    return (
      <Paper
        elevation={0}
        sx={{
          width: 350,
          // bgcolor: "#fafafa",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
          borderRadius: 0,
        }}
      >
        <Box sx={{ textAlign: "center", color: "text.secondary" }}>
          <Typography variant="body2" gutterBottom>
            No cell selected
          </Typography>
          <Typography variant="caption">
            Click on a cell in the canvas to edit its properties
          </Typography>
        </Box>
      </Paper>
    );
  }

  if (row?.rowType === "DYNAMIC" || !selectedCell.cellId) {
    return (
      <Paper
        elevation={0}
        sx={{ width: 350, overflow: "auto", bgcolor: "#fafafa" }}
      >
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <Typography
              variant="subtitle2"
              fontWeight={600}
              sx={{ color: "text.secondary" }}
            >
              DYNAMIC ROW
            </Typography>
            <Chip label={row?.id} size="small" sx={{ fontSize: "0.7rem" }} />
          </Box>
          <DynamicRowConfig
            dynamicConfig={row?.dynamicConfig || {}}
            templateColumns={templateColumns}
            onConfigChange={handleDynamicConfigChange}
          />
        </Box>
      </Paper>
    );
  }

  if (!cell) return null;

  return (
    <Paper
      elevation={0}
      sx={{
        width: 350,
        overflow: "auto",
        borderRadius: 0 /* , bgcolor: "#fafafa" */,
      }}
    >
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Typography
            variant="subtitle2"
            fontWeight={600}
            sx={{ color: "text.secondary" }}
          >
            CELL PROPERTIES
          </Typography>
          <Chip
            label={`${row?.id}_${column?.id}`}
            size="small"
            sx={{ fontSize: "0.7rem" }}
          />
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Accordion
            expanded={expandedPanels.cellType}
            onChange={() => handleExpand("cellType")}
            disableGutters
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={500}>
                Cell Type
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Cell Type</InputLabel>
                  <Select
                    value={cell.type || "TEXT"}
                    onChange={(e) => handleCellTypeChange(e.target.value)}
                    label="Cell Type"
                  >
                    {getCellTypeOptions.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {cellTypeWarning && (
                  <Alert severity="warning" sx={{ py: 0.5 }}>
                    <Typography variant="caption">{cellTypeWarning}</Typography>
                  </Alert>
                )}

                {cell.type === "TEXT" && (
                  <TextField
                    label="Text Value"
                    size="small"
                    multiline
                    rows={3}
                    value={debouncedTextValue}
                    onChange={(e) => setDebouncedTextValue(e.target.value)}
                    fullWidth
                  />
                )}

                {cell.type === "FORMULA" && (
                  <FormulaBuilder
                    expression={cell.expression || ""}
                    variables={cell.variables || {}}
                    template={templateForExport}
                    currentCellRowId={row?.id || ""}
                    currentCellColId={column?.id || ""}
                    onExpressionChange={(expr) =>
                      handleUpdateCell("expression", expr)
                    }
                    onVariablesChange={(vars) =>
                      handleUpdateCell("variables", vars)
                    }
                    formulaMode={formulaMode}
                    onFormulaModeChange={handleFormulaModeChange}
                  />
                )}
              </Box>
            </AccordionDetails>
          </Accordion>

          {cell.type?.startsWith("DB_") && (
            <Accordion
              expanded={expandedPanels.dbSource}
              onChange={() => handleExpand("dbSource")}
              disableGutters
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2" fontWeight={500}>
                  DB Source
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Autocomplete
                    size="small"
                    options={tableConfigs.map((t) => t.tableName)}
                    value={selectedTable || null}
                    onChange={(_, newValue) => {
                      handleUpdateCell("source.table", newValue || "");
                      handleUpdateCell("source.column", "");
                      setCellTypeWarning(null);
                    }}
                    getOptionLabel={(option) => {
                      const table = tableConfigs.find(
                        (t) => t.tableName === option,
                      );
                      return table
                        ? `${table.tableName} (${table.label})`
                        : option;
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Table"
                        placeholder="Select table..."
                      />
                    )}
                    fullWidth
                  />

                  <Autocomplete
                    size="small"
                    options={selectableColumns}
                    value={cell.source?.column || null}
                    onChange={(_, newValue) =>
                      handleColumnChange(newValue || "")
                    }
                    disabled={!selectedTable}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Column"
                        placeholder={
                          selectedTable
                            ? "Select column..."
                            : "Select table first"
                        }
                      />
                    )}
                    fullWidth
                  />

                  {selectedTable && cell.source?.column && (
                    <Box sx={{ p: 1, bgcolor: "#e8f5e9", borderRadius: 1 }}>
                      <Typography variant="caption" color="success.dark">
                        <strong>Supported aggregates:</strong>{" "}
                        {getAllowedAggFuncs(
                          selectedTable,
                          cell.source.column,
                        ).join(", ") || "None"}
                      </Typography>
                    </Box>
                  )}

                  <FilterBuilder
                    filters={cell.source?.filters || {}}
                    onFiltersChange={(filters) =>
                      handleUpdateCell("source.filters", filters)
                    }
                    tableName={selectedTable}
                  />
                </Box>
              </AccordionDetails>
            </Accordion>
          )}

          <Accordion
            expanded={expandedPanels.formatting}
            onChange={() => handleExpand("formatting")}
            disableGutters
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={500}>
                Formatting
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={cell.render?.bold || false}
                      onChange={(e) =>
                        handleUpdateCell("render.bold", e.target.checked)
                      }
                      size="small"
                    />
                  }
                  label="Bold"
                />

                <FormControl size="small" fullWidth>
                  <InputLabel>Text Align</InputLabel>
                  <Select
                    value={cell.render?.align || "left"}
                    onChange={(e) =>
                      handleUpdateCell("render.align", e.target.value)
                    }
                    label="Text Align"
                  >
                    <MenuItem value="left">Left</MenuItem>
                    <MenuItem value="center">Center</MenuItem>
                    <MenuItem value="right">Right</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  label="Colspan"
                  type="number"
                  size="small"
                  value={cell.render?.colspan || 1}
                  onChange={(e) =>
                    handleUpdateCell(
                      "render.colspan",
                      parseInt(e.target.value) || 1,
                    )
                  }
                  InputProps={{ inputProps: { min: 1, max: columns.length } }}
                  fullWidth
                />

                <TextField
                  label="Rowspan"
                  type="number"
                  size="small"
                  value={cell.render?.rowspan || 1}
                  onChange={(e) =>
                    handleUpdateCell(
                      "render.rowspan",
                      parseInt(e.target.value) || 1,
                    )
                  }
                  InputProps={{ inputProps: { min: 1, max: 10 } }}
                  fullWidth
                />
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedPanels.cellFormat}
            onChange={() => handleExpand("cellFormat")}
            disableGutters
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={500}>
                Cell Format
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Format Type</InputLabel>
                  <Select
                    value={cell.format?.type || "none"}
                    onChange={(e) =>
                      handleUpdateCell("format.type", e.target.value)
                    }
                    label="Format Type"
                  >
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="currency">Currency</MenuItem>
                    <MenuItem value="number">Number</MenuItem>
                    <MenuItem value="date">Date</MenuItem>
                    <MenuItem value="percentage">Percentage</MenuItem>
                  </Select>
                </FormControl>

                {cell.format?.type === "currency" && (
                  <>
                    <TextField
                      label="Currency Symbol"
                      size="small"
                      value={cell.format?.currencySymbol || ""}
                      onChange={(e) =>
                        handleUpdateCell(
                          "format.currencySymbol",
                          e.target.value,
                        )
                      }
                      placeholder="$"
                      fullWidth
                    />
                    <TextField
                      label="Decimals"
                      type="number"
                      size="small"
                      value={cell.format?.decimals ?? 2}
                      onChange={(e) =>
                        handleUpdateCell(
                          "format.decimals",
                          parseInt(e.target.value),
                        )
                      }
                      fullWidth
                    />
                  </>
                )}

                {cell.format?.type === "number" && (
                  <>
                    <TextField
                      label="Decimals"
                      type="number"
                      size="small"
                      value={cell.format?.decimals ?? 0}
                      onChange={(e) =>
                        handleUpdateCell(
                          "format.decimals",
                          parseInt(e.target.value),
                        )
                      }
                      fullWidth
                    />
                    <FormControl size="small" fullWidth>
                      <InputLabel>Thousand Separator</InputLabel>
                      <Select
                        value={
                          cell.format?.thousandSeparator ? "true" : "false"
                        }
                        onChange={(e) =>
                          handleUpdateCell(
                            "format.thousandSeparator",
                            e.target.value === "true",
                          )
                        }
                        label="Thousand Separator"
                      >
                        <MenuItem value="true">Yes</MenuItem>
                        <MenuItem value="false">No</MenuItem>
                      </Select>
                    </FormControl>
                  </>
                )}

                {cell.format?.type === "percentage" && (
                  <TextField
                    label="Decimals"
                    type="number"
                    size="small"
                    value={cell.format?.decimals ?? 2}
                    onChange={(e) =>
                      handleUpdateCell(
                        "format.decimals",
                        parseInt(e.target.value),
                      )
                    }
                    fullWidth
                  />
                )}

                {cell.format?.type === "date" && (
                  <TextField
                    label="Date Format"
                    size="small"
                    value={cell.format?.outputFormat || ""}
                    onChange={(e) =>
                      handleUpdateCell("format.outputFormat", e.target.value)
                    }
                    placeholder="dd-MMM-yyyy"
                    fullWidth
                  />
                )}

                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <TextField
                    label="Background Color"
                    size="small"
                    type="color"
                    value={cell.format?.bgColor || "#ffffff"}
                    onChange={(e) =>
                      handleUpdateCell("format.bgColor", e.target.value)
                    }
                    fullWidth
                    InputProps={{ sx: { height: 40 } }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() =>
                      handleUpdateCell("format.bgColor", "#ffffff")
                    }
                    sx={{ minWidth: 60, height: 40 }}
                  >
                    Reset
                  </Button>
                </Box>
              </Box>
            </AccordionDetails>
          </Accordion>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 1, px: 1 }}
          >
            Cell ID: cell_{row?.id}_{column?.id}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
});

RightPanel.displayName = "RightPanel";









// FormulaBuilder.jsx

import { useState, useEffect, useCallback, useMemo } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { useTableConfig } from "../../hooks/useTableConfig";
import { FilterBuilder } from "./FilterBuilder";
import CloseIcon from "@mui/icons-material/Close";

export const FormulaBuilder = ({
  expression,
  variables,
  template,
  currentCellRowId,
  currentCellColId,
  onExpressionChange,
  onVariablesChange,
  formulaMode,
  onFormulaModeChange,
}) => {
  const { tableConfigs, getSelectableColumns } = useTableConfig();
  const [showVariableDialog, setShowVariableDialog] = useState(false);
  const [newVarName, setNewVarName] = useState("");
  const [newVarType, setNewVarType] = useState("CELL_REF");
  const [newVarConfig, setNewVarConfig] = useState({});
  const [validationErrors, setValidationErrors] = useState([]);
  const [editingVarName, setEditingVarName] = useState(null);

  const currentCellRef =
    currentCellRowId && currentCellColId
      ? `cell_${currentCellRowId}_${currentCellColId}`
      : null;

  const rows = useMemo(
    () => template?.reportData?.rows || [],
    [template?.reportData?.rows]
  );
  const columns = useMemo(
    () => template?.reportData?.columns || [],
    [template?.reportData?.columns]
  );

  const dynamicRowIds = useMemo(
    () => rows.filter((r) => r.rowType === "DYNAMIC").map((r) => r.id),
    [rows]
  );

  const validateExpression = useCallback(
    (expr) => {
      const errors = [];

      if (!expr.trim()) {
        return errors;
      }

      let parenCount = 0;
      for (const char of expr) {
        if (char === "(") parenCount++;
        if (char === ")") parenCount--;
        if (parenCount < 0) {
          errors.push("Unbalanced parentheses: extra closing parenthesis");
          break;
        }
      }
      if (parenCount > 0) {
        errors.push("Unbalanced parentheses: missing closing parenthesis");
      }

      const operatorPattern = /[+\-*/]{2,}/;
      if (operatorPattern.test(expr.replace(/\s/g, ""))) {
        errors.push("Consecutive operators detected (e.g., ++ or --)");
      }

      const trimmed = expr.trim();
      if (/^[+*/]/.test(trimmed)) {
        errors.push("Expression cannot start with an operator (except -)");
      }
      if (/[+\-*/]$/.test(trimmed)) {
        errors.push("Expression cannot end with an operator");
      }

      const knownVars = new Set([
        ...Object.keys(variables || {}),
        "math",
        "abs",
      ]);
      const cellPattern = /cell_R__[A-Za-z0-9_]+_C__[A-Za-z0-9_]+/g;
      const cellRefs = expr.match(cellPattern) || [];

      if (currentCellRef && cellRefs.indexOf(currentCellRef) !== -1) {
        errors.push(
          "Cannot reference the current cell in its own formula (circular reference)"
        );
      }

      cellRefs.forEach((ref) => {
        const match = ref.match(/cell_(R__[A-Za-z0-9_]+)_(C__[A-Za-z0-9_]+)/);
        if (match) {
          const [, rowId, colId] = match;
          const row = rows.find((r) => r.id === rowId);
          const colExists = columns.some((c) => c.id === colId);

          if (!row) {
            errors.push(
              `Invalid cell reference: Row "${rowId}" does not exist`
            );
          } else if (row.rowType === "DYNAMIC") {
            errors.push(
              `Cannot reference dynamic row "${rowId}" in formula. Dynamic rows generate multiple rows at runtime.`
            );
          }
          if (!colExists) {
            errors.push(
              `Invalid cell reference: Column "${colId}" does not exist`
            );
          }
        }
      });

      const variablePattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
      let varMatch;
      while ((varMatch = variablePattern.exec(expr)) !== null) {
        const varName = varMatch[1];
        if (
          !varName.startsWith("cell_") &&
          !varName.startsWith("R__") &&
          !varName.startsWith("C__") &&
          !knownVars.has(varName)
        ) {
          const context = expr.substring(
            Math.max(0, varMatch.index - 5),
            varMatch.index + varName.length + 5
          );
          if (!context.includes("cell_") && !context.includes("_C__")) {
            errors.push(`Undefined variable: "${varName}"`);
          }
        }
      }

      return errors;
    },
    [rows, columns, variables, currentCellRef]
  );

  useEffect(() => {
    const errors = validateExpression(expression);
    setValidationErrors(errors);
  }, [expression, validateExpression]);

  useEffect(() => {
    const handleCellSelected = (event) => {
      const cellRef = event.detail;

      if (currentCellRef && cellRef === currentCellRef) {
        setValidationErrors((prev) => [
          ...new Set([
            ...prev,
            "Cannot reference the current cell in its own formula",
          ]),
        ]);
        return;
      }

      const match = cellRef.match(/cell_(R__[A-Za-z0-9_]+)_(C__[A-Za-z0-9_]+)/);
      if (match) {
        const [, rowId] = match;
        const row = rows.find((r) => r.id === rowId);
        if (row?.rowType === "DYNAMIC") {
          setValidationErrors((prev) => [
            ...new Set([
              ...prev,
              `Cannot reference dynamic row "${rowId}" in formula`,
            ]),
          ]);
          return;
        }
      }

      const trimmedExpr = expression.trim();
      if (trimmedExpr && !trimmedExpr.match(/[+\-*/(\s]$/)) {
        onExpressionChange(expression + " + " + cellRef);
      } else {
        onExpressionChange(
          expression +
            (expression && !expression.endsWith(" ") ? " " : "") +
            cellRef
        );
      }
    };

    window.addEventListener("formula-cell-selected", handleCellSelected);
    return () =>
      window.removeEventListener("formula-cell-selected", handleCellSelected);
  }, [expression, onExpressionChange, currentCellRef, rows]);

  const selectableColumns = useMemo(
    () => (newVarConfig.table ? getSelectableColumns(newVarConfig.table) : []),
    [newVarConfig.table, getSelectableColumns]
  );

  const addOperator = useCallback(
    (op) => {
      onExpressionChange(expression + " " + op + " ");
    },
    [expression, onExpressionChange]
  );

  const toggleFormulaMode = useCallback(() => {
    onFormulaModeChange(!formulaMode);
  }, [formulaMode, onFormulaModeChange]);

  const addVariable = useCallback(() => {
    setNewVarName("");
    setNewVarType("CELL_REF");
    setNewVarConfig({});
    setEditingVarName(null);
    setShowVariableDialog(true);
  }, []);

  const editVariable = useCallback(
    (name) => {
      const config = variables[name];
      setNewVarName(name);
      if (config === "CELL_REF" || config?.type === "CELL_REF") {
        setNewVarType("CELL_REF");
        setNewVarConfig({});
      } else {
        setNewVarType(config?.type || "DB_VALUE");
        setNewVarConfig({
          table: config?.table || "",
          column: config?.column || "",
          filters: config?.filters || {},
        });
      }
      setEditingVarName(name);
      setShowVariableDialog(true);
    },
    [variables]
  );

  const removeVariable = useCallback(
    (name) => {
      const newVars = { ...variables };
      delete newVars[name];
      onVariablesChange(newVars);
    },
    [variables, onVariablesChange]
  );

  const saveVariable = useCallback(() => {
    if (!newVarName) return;

    const newVars = { ...variables };

    // If editing and name changed, remove old key
    if (editingVarName && editingVarName !== newVarName) {
      delete newVars[editingVarName];
    }

    if (newVarType === "CELL_REF") {
      newVars[newVarName] = "CELL_REF";
    } else {
      newVars[newVarName] = {
        type: newVarType,
        table: newVarConfig.table || "",
        column: newVarConfig.column || "",
        filters: newVarConfig.filters || {},
      };
    }

    onVariablesChange(newVars);
    setShowVariableDialog(false);
    setEditingVarName(null);
  }, [
    newVarName,
    newVarType,
    newVarConfig,
    variables,
    editingVarName,
    onVariablesChange,
  ]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box>
        <Typography
          variant="caption"
          fontWeight={600}
          sx={{ mb: 1, display: "block" }}
        >
          EXPRESSION
        </Typography>
        <TextField
          value={expression}
          onChange={(e) => onExpressionChange(e.target.value)}
          placeholder="e.g., cell_R__R1_C__C1 + variable1"
          size="small"
          fullWidth
          multiline
          rows={4}
          error={validationErrors.length > 0}
          sx={{ fontFamily: "monospace" }}
        />
        {validationErrors.length > 0 && (
          <Alert severity="error" sx={{ mt: 1, py: 0 }}>
            <Typography variant="caption">
              {validationErrors.map((err, i) => (
                <span key={i}>
                  {err}
                  {i < validationErrors.length - 1 && <br />}
                </span>
              ))}
            </Typography>
          </Alert>
        )}
      </Box>

      <Box>
        <Typography
          variant="caption"
          fontWeight={600}
          sx={{ mb: 1, display: "block" }}
        >
          OPERATORS
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {["+", "-", "*", "/", "(", ")"].map((op) => (
            <Button
              key={op}
              variant="outlined"
              size="small"
              onClick={() => addOperator(op)}
              sx={{ minWidth: 40 }}
            >
              {op}
            </Button>
          ))}
        </Box>
      </Box>

      <Box>
        <Typography
          variant="caption"
          fontWeight={600}
          sx={{ mb: 1, display: "block" }}
        >
          INSERT
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          <Button
            variant={formulaMode ? "contained" : "outlined"}
            size="small"
            onClick={toggleFormulaMode}
            sx={{
              bgcolor: formulaMode ? "#ff9800" : undefined,
              color: formulaMode ? "white" : undefined,
              "&:hover": { bgcolor: formulaMode ? "#f57c00" : undefined },
            }}
          >
            {formulaMode
              ? "Click cells to add (Active)"
              : "Select Cell from Canvas"}
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={addVariable}
          >
            Variable
          </Button>
        </Box>
        {formulaMode && (
          <Alert severity="info" sx={{ mt: 1, py: 0.5 }}>
            <Typography variant="caption">
              Click on cells in the canvas to add them to the formula. Dynamic
              rows and the current cell cannot be selected.
            </Typography>
          </Alert>
        )}
      </Box>

      <Box>
        <Typography
          variant="caption"
          fontWeight={600}
          sx={{ mb: 1, display: "block" }}
        >
          VARIABLES ({Object.keys(variables || {}).length})
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {Object.entries(variables || {}).map(([name, config]) => (
            <Box
              key={name}
              sx={{
                p: 1,
                bgcolor: "background.paper",
                border: "1px solid #e0e0e0",
                borderRadius: 1,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <Box>
                <Chip
                  label={name}
                  size="small"
                  color="primary"
                  sx={{ mb: 0.5 }}
                />
                <Typography
                  variant="caption"
                  display="block"
                  color="text.secondary"
                >
                  {config === "CELL_REF"
                    ? "Cell Reference"
                    : `${config.type} from ${config.table}.${config.column}`}
                </Typography>
              </Box>
              <Box>
                <IconButton
                  size="small"
                  onClick={() => editVariable(name)}
                  title="Edit variable"
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => removeVariable(name)}
                  title="Delete variable"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      <Dialog
        open={showVariableDialog}
        onClose={() => {
          setShowVariableDialog(false);
          setEditingVarName(null);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <IconButton
            onClick={() => {
              setShowVariableDialog(false);
              setEditingVarName(null);
            }}
            sx={{
              width: 30,
              height: 30,
              position: "absolute",
              right: 16,
              top: 10,
            }}
          >
            <CloseIcon />
          </IconButton>
          <Typography sx={{ fontWeight: "bold" }}>
            {editingVarName ? "Edit Variable" : "Add Variable"}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField
              label="Variable Name"
              value={newVarName}
              onChange={(e) =>
                setNewVarName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))
              }
              placeholder="e.g., maxBalance"
              size="small"
              fullWidth
              helperText="Only letters, numbers, and underscores"
            />

            <FormControl size="small" fullWidth>
              <InputLabel>Variable Type</InputLabel>
              <Select
                value={newVarType}
                onChange={(e) => setNewVarType(e.target.value)}
                label="Variable Type"
              >
                {/* <MenuItem value="CELL_REF">Cell Reference</MenuItem> */}
                <MenuItem value="DB_VALUE">DB Value</MenuItem>
                <MenuItem value="DB_SUM">DB Sum</MenuItem>
                <MenuItem value="DB_COUNT">DB Count</MenuItem>
                <MenuItem value="DB_AVG">DB Average</MenuItem>
                <MenuItem value="DB_MIN">DB Min</MenuItem>
                <MenuItem value="DB_MAX">DB Max</MenuItem>
              </Select>
            </FormControl>

            {newVarType !== "CELL_REF" && (
              <>
                <Autocomplete
                  size="small"
                  options={tableConfigs.map((t) => t.tableName)}
                  value={newVarConfig.table || null}
                  onChange={(_, newValue) =>
                    setNewVarConfig({
                      ...newVarConfig,
                      table: newValue || "",
                      column: "",
                    })
                  }
                  getOptionLabel={(option) => {
                    const table = tableConfigs.find(
                      (t) => t.tableName === option
                    );
                    return table
                      ? `${table.tableName} (${table.label})`
                      : option;
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Table"
                      placeholder="Select table..."
                    />
                  )}
                  fullWidth
                />

                <Autocomplete
                  size="small"
                  options={selectableColumns}
                  value={newVarConfig.column || null}
                  onChange={(_, newValue) =>
                    setNewVarConfig({ ...newVarConfig, column: newValue || "" })
                  }
                  disabled={!newVarConfig.table}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Column"
                      placeholder={
                        newVarConfig.table
                          ? "Select column..."
                          : "Select table first"
                      }
                    />
                  )}
                  fullWidth
                />

                <FilterBuilder
                  filters={newVarConfig.filters || {}}
                  onFiltersChange={(filters) =>
                    setNewVarConfig({ ...newVarConfig, filters })
                  }
                  tableName={newVarConfig.table || ""}
                />
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setShowVariableDialog(false);
              setEditingVarName(null);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={saveVariable}
            variant="contained"
            disabled={!newVarName}
          >
            {editingVarName ? "Save Changes" : "Add Variable"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

