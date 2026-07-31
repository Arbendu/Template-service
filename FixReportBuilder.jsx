import { useState, useEffect, useCallback, memo, useMemo } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Autocomplete from "@mui/material/Autocomplete";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { useTableConfig } from "../../hooks/useTableConfig";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import ConfirmationDialog from "../dialogs/ConfirmationDialog";

const OPERATORS = [
  { value: "=", label: "Equals (=)" },
  { value: "!=", label: "Not Equals (≠)" },
  { value: ">", label: "Greater Than (>)" },
  { value: ">=", label: "Greater or Equal (≥)" },
  { value: "<", label: "Less Than (<)" },
  { value: "<=", label: "Less or Equal (≤)" },
  { value: "LIKE", label: "Contains (LIKE)" },
  { value: "IN", label: "In List (IN)" },
  // { value: "NOT IN", label: "Not In List (NOT IN)" },
  // { value: "IS NULL", label: "Is Empty (NULL)" },
  // { value: "IS NOT NULL", label: "Is Not Empty (NOT NULL)" },
];

export const FilterBuilder = memo(
  ({
    filters,
    onFiltersChange,
    tableName = "",
    title = "Filter Conditions",
    availableColumns: customColumns,
  }) => {
    const { getFilterableColumns, getColumnDataType } = useTableConfig();
    const [newInValue, setNewInValue] = useState("");

    const { confirm, dialogProps } = useConfirmDialog();

    const availableColumns = useMemo(
      () => customColumns || (tableName ? getFilterableColumns(tableName) : []),
      [customColumns, tableName, getFilterableColumns],
    );

    const parseFiltersToUI = useCallback(() => {
      const conditions = [];

      Object.entries(filters || {}).forEach(([column, columnConditions]) => {
        const dataType = tableName
          ? getColumnDataType(tableName, column)
          : undefined;

        if (Array.isArray(columnConditions)) {
          columnConditions.forEach((condition, index) => {
            conditions.push({
              column,
              conditionIndex: index,
              condition: {
                ...condition,
                dataType: condition.dataType || dataType,
              },
            });
          });
        } else if (
          typeof columnConditions === "object" &&
          columnConditions !== null
        ) {
          if (columnConditions.op !== undefined) {
            conditions.push({
              column,
              conditionIndex: 0,
              condition: {
                op: columnConditions.op,
                value: columnConditions.value,
                dataType: columnConditions.dataType || dataType,
              },
            });
          } else {
            Object.entries(columnConditions).forEach(([op, val], index) => {
              conditions.push({
                column,
                conditionIndex: index,
                condition: {
                  op,
                  value: val,
                  dataType,
                },
              });
            });
          }
        } else {
          conditions.push({
            column,
            conditionIndex: 0,
            condition: {
              op: "=",
              value: columnConditions,
              dataType,
            },
          });
        }
      });

      return conditions;
    }, [filters, tableName, getColumnDataType]);

    const [uiConditions, setUiConditions] = useState(parseFiltersToUI);

    useEffect(() => {
      setUiConditions(parseFiltersToUI());
    }, [filters, tableName /* , parseFiltersToUI */]);

    const conditionsToFilters = useCallback((conds) => {
      const result = {};

      conds.forEach((cond) => {
        if (!result[cond.column]) {
          result[cond.column] = [];
        }
        result[cond.column].push(cond.condition);
      });

      return result;
    }, []);

    const updateConditions = useCallback(
      (newConditions) => {
        setUiConditions(newConditions);
        onFiltersChange(conditionsToFilters(newConditions));
      },
      [onFiltersChange, conditionsToFilters],
    );

    const addCondition = useCallback(() => {
      const firstColumn = availableColumns[0] || "";
      const dataType =
        tableName && firstColumn
          ? getColumnDataType(tableName, firstColumn)
          : undefined;
      const newCondition = {
        column: firstColumn,
        conditionIndex: 0,
        condition: { op: "=", value: "", dataType },
      };
      updateConditions([...uiConditions, newCondition]);
    }, [
      availableColumns,
      uiConditions,
      updateConditions,
      tableName,
      getColumnDataType,
    ]);

    const removeCondition = useCallback(
      async (index) => {
        const isConfirmed = await confirm({
          title: "Delete Condition",
          // itemName: "",
          content:
            "Are you sure you want to delete the condition? This action cannot be undone.",
        });

        if (!isConfirmed) return;
        updateConditions(uiConditions.filter((_, i) => i !== index));
      },
      [uiConditions, updateConditions],
    );

    const updateCondition = useCallback(
      (index, field, value) => {
        const newConditions = [...uiConditions];

        if (field === "column") {
          const dataType =
            tableName && value ? getColumnDataType(tableName, value) : null;

          newConditions[index] = {
            ...newConditions[index],
            column: value,
            condition: { ...newConditions[index].condition, dataType },
          };
        } else if (field === "op") {
          const newOp = value;
          let newValue = newConditions[index].condition.value;

          if (newOp === "IN" || newOp === "NOT IN") {
            newValue = [];
          } else if (Array.isArray(newValue)) {
            newValue = "";
          } else if (newOp === "IS NULL" || newOp === "IS NOT NULL") {
            newValue = null;
          }

          newConditions[index] = {
            ...newConditions[index],
            condition: { op: newOp, value: newValue },
          };
        } else if (field === "value") {
          newConditions[index] = {
            ...newConditions[index],
            condition: { ...newConditions[index].condition, value },
          };
        }

        updateConditions(newConditions);
      },
      [getColumnDataType, tableName, uiConditions, updateConditions],
    );

    const addInValue = useCallback(
      (index, val) => {
        if (!val.trim()) return;
        const newConditions = [...uiConditions];
        const currentValues = Array.isArray(
          newConditions[index].condition.value,
        )
          ? newConditions[index].condition.value
          : [];
        newConditions[index] = {
          ...newConditions[index],
          condition: {
            ...newConditions[index].condition,
            value: [...currentValues, val.trim()],
            dataType: newConditions[index].condition.dataType,
          },
        };
        updateConditions(newConditions);
        setNewInValue("");
      },
      [uiConditions, updateConditions],
    );

    const removeInValue = useCallback(
      (condIndex, valIndex) => {
        const newConditions = [...uiConditions];
        const currentValues = newConditions[condIndex].condition.value;
        newConditions[condIndex] = {
          ...newConditions[condIndex],
          condition: {
            ...newConditions[condIndex].condition,
            value: currentValues.filter((_, i) => i !== valIndex),
            dataType: newConditions[condIndex].condition.dataType,
          },
        };
        updateConditions(newConditions);
      },
      [uiConditions, updateConditions],
    );

    const isNullOperator = (op) => op === "IS NULL" || op === "IS NOT NULL";
    const isInOperator = (op) => op === "IN" || op === "NOT IN";

    const groupedByColumn = uiConditions.reduce((acc, cond, idx) => {
      if (!acc[cond.column]) {
        acc[cond.column] = [];
      }
      acc[cond.column].push({ ...cond, originalIndex: idx });
      return acc;
    }, {});

    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography fontWeight={600} color="text.secondary">
            {title}
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={addCondition}
            variant="outlined"
            disabled={!tableName}
          >
            Add Condition
          </Button>
        </Box>

        {availableColumns.length === 0 && (
          <Paper
            variant="outlined"
            sx={{ p: 2, textAlign: "center", bgcolor: "#fff3e0" }}
          >
            <Typography variant="body2" color="warning.dark">
              {customColumns
                ? "No columns available for filtering."
                : "Please select a table first to add filter conditions."}
            </Typography>
          </Paper>
        )}

        {availableColumns.length > 0 && uiConditions.length === 0 && (
          <Paper
            variant="outlined"
            sx={{ p: 2, textAlign: "center", bgcolor: "#f5f5f5" }}
          >
            <Typography variant="body2" color="text.secondary">
              No filter conditions. Click "Add Condition" to add filters.
            </Typography>
          </Paper>
        )}

        {uiConditions.map((cond, index) => (
          <Paper
            key={index}
            variant="outlined"
            sx={{ p: 1.5, bgcolor: "#fafafa" }}
          >
            <Box
              sx={{
                display: "flex",
                gap: 1,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <Autocomplete
                size="small"
                sx={{ minWidth: 140 }}
                fullWidth
                options={availableColumns}
                value={cond.column || null}
                onChange={(_, newValue) =>
                  updateCondition(index, "column", newValue || "")
                }
                renderInput={(params) => (
                  <TextField {...params} label="Column" />
                )}
                freeSolo={false}
              />

              <FormControl size="small" fullWidth sx={{ minWidth: 150 }}>
                <InputLabel>Operator</InputLabel>
                <Select
                  value={cond.condition.op}
                  onChange={(e) => updateCondition(index, "op", e.target.value)}
                  label="Operator"
                >
                  {OPERATORS.map((op) => (
                    <MenuItem key={op.value} value={op.value}>
                      {op.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {!isNullOperator(cond.condition.op) &&
                !isInOperator(cond.condition.op) && (
                  <TextField
                    size="small"
                    label="Value"
                    value={cond.condition.value || ""}
                    onChange={(e) =>
                      updateCondition(index, "value", e.target.value)
                    }
                    sx={{ flex: 1, minWidth: 100 }}
                  />
                )}

              <IconButton
                size="small"
                onClick={() => removeCondition(index)}
                color="error"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>

            {isInOperator(cond.condition.op) && (
              <Box sx={{ mt: 1.5, pl: 1 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mb: 1, display: "block" }}
                >
                  Values in list:
                </Typography>
                <Box
                  sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}
                >
                  {Array.isArray(cond.condition.value) &&
                    cond.condition.value.map((val, valIndex) => (
                      <Chip
                        key={valIndex}
                        label={val}
                        size="small"
                        onDelete={() => removeInValue(index, valIndex)}
                        color="primary"
                        variant="outlined"
                      />
                    ))}
                  {(!Array.isArray(cond.condition.value) ||
                    cond.condition.value.length === 0) && (
                    <Typography variant="caption" color="text.disabled">
                      No values added yet
                    </Typography>
                  )}
                </Box>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <TextField
                    size="small"
                    label="Add value"
                    value={newInValue}
                    onChange={(e) => setNewInValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addInValue(index, newInValue);
                      }
                    }}
                    sx={{ flex: 1 }}
                  />
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => addInValue(index, newInValue)}
                  >
                    Add
                  </Button>
                </Box>
              </Box>
            )}
          </Paper>
        ))}

        {uiConditions.length > 0 && (
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "#e8f5e9" }}>
            <Typography variant="caption" color="success.dark">
              <strong>Preview:</strong> {uiConditions.length} condition
              {uiConditions.length !== 1 ? "s" : ""} will be applied
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              {Object.entries(groupedByColumn).map(([column, conditions]) => (
                <Box key={column} sx={{ mb: 0.5 }}>
                  <Typography
                    variant="caption"
                    fontWeight={600}
                    color="text.primary"
                  >
                    {column}:
                  </Typography>
                  {conditions.map((c, i) => (
                    <Typography
                      key={i}
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", pl: 1 }}
                    >
                      {c.condition.op}{" "}
                      {isNullOperator(c.condition.op)
                        ? ""
                        : isInOperator(c.condition.op)
                          ? `(${c.condition.value.join(", ")})`
                          : `"${c.condition.value}"`}
                    </Typography>
                  ))}
                </Box>
              ))}
            </Box>
          </Paper>
        )}

        <ConfirmationDialog {...dialogProps} />
      </Box>
    );
  },
);

FilterBuilder.displayName = "FilterBuilder";
