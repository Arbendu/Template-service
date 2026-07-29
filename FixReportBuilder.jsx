// AddRowDialog

import { useState, useEffect, useMemo } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import { IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

export const AddRowDialog = ({
  open,
  rowType,
  existingRowIds,
  onClose,
  onConfirm,
}) => {
  const [customId, setCustomId] = useState("");
  const [error, setError] = useState("");
  const [generatedId, setGeneratedId] = useState("");

  // O(1) lookup table for instant collision detection
  const existingIdsSet = useMemo(() => {
    return new Set(existingRowIds);
  }, [existingRowIds]);

  const generateUniqueID = () => {
    let newId;
    let isUnique = false;
    let numAttempts = 0;

    // Saturation threshold: If we fail 15 times, the 100k space is effectively exhausted.
    const MAX_NUMERIC_ATTEMPTS = 15;

    // Create an array to hold secure random values
    const randomBuffer = new Uint32Array(1);

    // Phase 1: Exhaust 5-Digit Numerical IDs
    while (!isUnique && numAttempts < MAX_NUMERIC_ATTEMPTS) {
      // Generate a cryptographically secure random number
      window.crypto.getRandomValues(randomBuffer);

      // Convert to a number between 0 and 99999, padded to 5 digits
      const numericPart = (randomBuffer[0] % 100000)
        .toString()
        .padStart(5, "0");
      newId = `R__${numericPart}`;

      if (!existingIdsSet.has(newId)) {
        isUnique = true;
      }
      numAttempts++;
    }

    // Phase 2: Numerical Exhausted -> Fallback to 5-Character Alphanumeric
    if (!isUnique) {
      let alphaAttempts = 0;
      const MAX_ALPHA_ATTEMPTS = 20;

      while (!isUnique && alphaAttempts < MAX_ALPHA_ATTEMPTS) {
        // Base36 provides a-z, 0-9.
        // We generate a secure string of 5 characters.
        window.crypto.getRandomValues(randomBuffer);
        const alphaPart = randomBuffer[0]
          .toString(36)
          .substring(0, 5)
          .padEnd(5, "0");

        newId = `R__${alphaPart}`;

        if (!existingIdsSet.has(newId)) {
          isUnique = true;
        }
        alphaAttempts++;
      }
    }

    // Phase 3: Absolute Fallback (Prevents infinite loops in catastrophic collisions)
    if (!isUnique) {
      let counter = 0;
      do {
        const fallbackPart = (Date.now() + counter)
          .toString(36)
          .slice(-5)
          .padStart(5, "0");
        newId = `R__${fallbackPart}`;
        counter++;
      } while (existingIdsSet.has(newId));
    }

    return newId;
  };

  useEffect(() => {
    if (open) {
      const newId = generateUniqueID();
      setGeneratedId(newId);
      setCustomId("");
      setError("");
    }
  }, [open, existingIdsSet]);

  const validateId = (id) => {
    if (!id.trim() || id === "R__") return null;

    if (/\s/.test(id)) {
      return "Row ID cannot contain spaces";
    }

    if (!/^R__[a-zA-Z0-9_]+$/.test(id)) {
      return "Row ID can only contain letters, numbers, and underscores";
    }

    if (existingIdsSet.has(id)) {
      return "This Row ID already exists";
    }

    return null;
  };

  const handleIdChange = (value) => {
    setCustomId(value);
    const idToValidate = value.startsWith("R__") ? value : "R__" + value;
    const validationError = validateId(idToValidate);
    setError(validationError || "");
  };

  const handleConfirm = () => {
    const trimmedId = customId.trim();
    let finalId = "";

    if (trimmedId) {
      finalId = trimmedId.startsWith("R__") ? trimmedId : "R__" + trimmedId;
      const validationError = validateId(finalId);
      if (validationError) {
        setError(validationError);
        return;
      }
    } else {
      finalId = generatedId;
    }

    onConfirm(finalId);
    handleClose();
  };

  const handleClose = () => {
    setCustomId("");
    setError("");
    onClose();
  };

  const displayedId = customId.trim()
    ? customId.trim().startsWith("R__")
      ? customId.trim()
      : `R__${customId.trim()}`
    : generatedId;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ p: 2, position: "relative" }}>
        <IconButton
          onClick={handleClose}
          sx={{ position: "absolute", right: 16, top: 10 }}
        >
          <CloseIcon />
        </IconButton>
        <Typography>Add {rowType} Row</Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Enter a custom Row ID or leave empty to use the suggested ID.
          </Typography>

          <TextField
            label="Row ID (optional)"
            value={customId}
            onChange={(e) => handleIdChange(e.target.value)}
            placeholder="e.g., 04512, alpha_row"
            error={!!error}
            helperText={error || "Letters, numbers, and underscores only"}
            fullWidth
            autoFocus
          />

          {!customId.trim() && !error && (
            <Alert severity="info" sx={{ py: 0.5 }}>
              A unique ID will be used: <strong>{generatedId}</strong>
            </Alert>
          )}

          {customId.trim() && !error && (
            <Alert severity="success" sx={{ py: 0.5 }}>
              Row will be created with ID: <strong>{displayedId}</strong>
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" disabled={!!error}>
          Add Row
        </Button>
      </DialogActions>
    </Dialog>
  );
};






// LeftPanel


import { memo, useState, useCallback } from "react";
import Paper from "@mui/material/Paper";

/* ---------------- REDUX ---------------- */

import { useAppDispatch, useAppSelector } from "../../store";

import {
  selectTemplateMeta,
  selectReportMeta,
  selectColumns,
  selectRows,
  selectVariants,
  selectTableNames,
  selectDynamicRowIds,
  selectExistingRowIds,
  selectGlobals,
} from "../../store/selectors";

import {
  setTemplateMeta,
  setReportMeta,
  addColumn,
  updateColumn,
  updateColumnFormat,
  removeColumn,
  addRow,
  removeRow,
  reorderRows,
  addVariant,
  updateVariant,
  removeVariant,
  addGlobalVariable,
  updateGlobalVariable,
  removeGlobalVariable,
} from "../../store/templateSlice";

/* ---------------- PANELS ---------------- */

import { MetadataPanel } from "./MetadataPanel";
import { ColumnsPanel } from "./ColumnsPanel";
import { RowsPanel } from "./RowsPanel";
import { GlobalsPanel } from "./GlobalsPanel";
import { VariantsPanel } from "./VariantsPanel";

/* ---------------- DIALOGS ---------------- */

import { AddRowDialog } from "./AddRowDialog";
import { VariantDialog } from "./VariantDialog";
import { GlobalVariableDialog } from "./GlobalVariableDialog";
import { ExtrasDialog } from "./ExtrasDialog";
import { Box, Menu, MenuItem, Typography } from "@mui/material";

/* ------------------------------------------------ */

export const LeftPanel = memo(() => {
  const dispatch = useAppDispatch();

  /* ---------------- STORE ---------------- */

  const templateMeta = useAppSelector(selectTemplateMeta);
  const reportMeta = useAppSelector(selectReportMeta);
  const columns = useAppSelector(selectColumns);
  const rows = useAppSelector(selectRows);
  const variants = useAppSelector(selectVariants);
  const globals = useAppSelector(selectGlobals);
  const tableNames = useAppSelector(selectTableNames);
  const dynamicRowIds = useAppSelector(selectDynamicRowIds);
  const existingRowIds = useAppSelector(selectExistingRowIds);

  /* ---------------- PANEL EXPANSION ---------------- */

  const [expandedPanels, setExpandedPanels] = useState({
    metadata: true,
    columns: false,
    rows: false,
    globals: false,
    variants: false,
  });

  const handleExpand = useCallback((panel) => {
    setExpandedPanels((p) => ({ ...p, [panel]: !p[panel] }));
  }, []);

  /* ---------------- METADATA ---------------- */

  const updateMetadata = useCallback(
    (field, value) => {
      if (field.startsWith("reportMeta.")) {
        dispatch(setReportMeta({ [field.split(".")[1]]: value }));
      } else {
        dispatch(setTemplateMeta({ [field.split(".")[1]]: value }));
      }
    },
    [dispatch],
  );

  /* ---------------- COLUMNS ---------------- */

  const [editingColumn, setEditingColumn] = useState(null);

  const handleAddColumn = useCallback(() => {
    dispatch(addColumn());
  }, [dispatch]);

  const handleUpdateColumn = useCallback(
    (index, field, value) => {
      if (field.includes(".")) {
        const [, formatKey] = field.split(".");
        dispatch(updateColumnFormat({ index, format: { [formatKey]: value } }));
      } else {
        dispatch(updateColumn({ index, column: { [field]: value } }));
      }
    },
    [dispatch],
  );

  const handleRemoveColumn = useCallback(
    (colId, index) => {
      dispatch(removeColumn({ colId, index }));
    },
    [dispatch],
  );

  /* ---------------- ROWS ---------------- */

  const [draggedRowIndex, setDraggedRowIndex] = useState(null);
  const [dropTargetIndex, setDropTargetIndex] = useState(null);
  const [insertMenuAnchor, setInsertMenuAnchor] = useState(null);
  const [insertAtIndex, setInsertAtIndex] = useState(0);
  const [addRowDialogState, setAddRowDialogState] = useState({
    open: false,
    rowType: "",
    insertAt: 0,
  });

  const openAddRowDialog = useCallback(
    (type, insertAt = rows.length) => {
      setAddRowDialogState({ open: true, rowType: type, insertAt });
      setInsertMenuAnchor(null);
    },
    [rows.length],
  );

  const handleAddRow = useCallback(
    (rowId) => {
      const { rowType, insertAt } = addRowDialogState;
      const newRow = { id: rowId, rowType };

      if (rowType === "DYNAMIC") {
        newRow.dynamicConfig = {
          type: "DB_LIST",
          table: "",
          select: [],
          filters: {},
          columnMappings: [],
        };
      }

      dispatch(addRow({ row: newRow, insertAt }));
      setAddRowDialogState({ open: false, rowType: "", insertAt: 0 });
    },
    [dispatch, addRowDialogState],
  );

  const handleRemoveRow = useCallback(
    (rowId) => {
      dispatch(removeRow({ rowId }));
    },
    [dispatch],
  );

  const handleDragStart = useCallback((index) => {
    setDraggedRowIndex(index);
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    setDropTargetIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (
      draggedRowIndex !== null &&
      dropTargetIndex !== null &&
      draggedRowIndex !== dropTargetIndex
    ) {
      dispatch(reorderRows({ fromIndex: draggedRowIndex, toIndex: dropTargetIndex }));
    }
    setDraggedRowIndex(null);
    setDropTargetIndex(null);
  }, [dispatch, draggedRowIndex, dropTargetIndex]);

  const handleInsertClick = useCallback((event, index) => {
    setInsertMenuAnchor(event.currentTarget);
    setInsertAtIndex(index);
  }, []);

  /* ---------------- VARIANTS ---------------- */

  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState(null);
  const [editingVariantIndex, setEditingVariantIndex] = useState(null);

  const openAddVariantDialog = () => {
    setEditingVariant(null);
    setEditingVariantIndex(null);
    setVariantDialogOpen(true);
  };

  const openEditVariantDialog = (variant, index) => {
    setEditingVariant(variant);
    setEditingVariantIndex(index);
    setVariantDialogOpen(true);
  };

  const handleSaveVariant = useCallback(
    (variant) => {
      if (editingVariantIndex !== null) {
        dispatch(updateVariant({ index: editingVariantIndex, variant }));
      } else {
        dispatch(addVariant(variant));
      }
      setVariantDialogOpen(false);
      setEditingVariant(null);
      setEditingVariantIndex(null);
    },
    [dispatch, editingVariantIndex],
  );

  const handleRemoveVariant = useCallback(
    (index) => {
      dispatch(removeVariant(index));
    },
    [dispatch],
  );

  /* ---------------- GLOBAL VARIABLES ---------------- */

  const [globalDialogOpen, setGlobalDialogOpen] = useState(false);
  const [editingGlobal, setEditingGlobal] = useState(null);
  const [editingGlobalIndex, setEditingGlobalIndex] = useState(null);

  const openAddGlobalVariableDialog = () => {
    setEditingGlobal(null);
    setEditingGlobalIndex(null);
    setGlobalDialogOpen(true);
  };

  const openEditGlobalVariableDialog = (global, index) => {
    setEditingGlobal(global);
    setEditingGlobalIndex(index);
    setGlobalDialogOpen(true);
  };

  const handleSaveGlobalVariable = useCallback(
    (global) => {
      if (editingGlobalIndex !== null) {
        dispatch(updateGlobalVariable({ index: editingGlobalIndex, global }));
      } else {
        dispatch(addGlobalVariable(global));
      }
      setGlobalDialogOpen(false);
      setEditingGlobal(null);
      setEditingGlobalIndex(null);
    },
    [dispatch, editingGlobalIndex],
  );

  const handleRemoveGlobalVariable = useCallback(
    (index) => {
      dispatch(removeGlobalVariable(index));
    },
    [dispatch],
  );

  /* ---------------- EXTRAS HEADERS ---------------- */

  const [extrasHeadersDialogOpen, setExtrasHeadersDialogOpen] = useState(false);

  const handleSaveExtrasHeaders = useCallback(
    (extras) => {
      dispatch(setReportMeta({ extras }));
    },
    [dispatch],
  );

  /* ---------------- RENDER ---------------- */

  return (
    <Paper elevation={0} sx={{ width: 340, overflow: "auto", borderRadius: 0 }}>
      <Box sx={{ p: 2 }}>
        <Typography
          variant="subtitle2"
          fontWeight={600}
          gutterBottom
          sx={{ color: "text.secondary" }}
        >
          REPORT STRUCTURE
        </Typography>

        <MetadataPanel
          expanded={expandedPanels.metadata}
          onToggle={() => handleExpand("metadata")}
          templateMeta={templateMeta}
          reportMeta={reportMeta}
          onUpdate={updateMetadata}
          onOpenExtrasHeaders={() => setExtrasHeadersDialogOpen(true)}
          extrasHeadersCount={reportMeta.extras?.length ?? 0}
        />

        <ColumnsPanel
          expanded={expandedPanels.columns}
          onToggle={() => handleExpand("columns")}
          columns={columns}
          editingColumn={editingColumn}
          setEditingColumn={setEditingColumn}
          onAddColumn={handleAddColumn}
          onRemoveColumn={handleRemoveColumn}
          onUpdateColumn={handleUpdateColumn}
        />

        <RowsPanel
          expanded={expandedPanels.rows}
          onToggle={() => handleExpand("rows")}
          rows={rows}
          draggedRowIndex={draggedRowIndex}
          dropTargetIndex={dropTargetIndex}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onInsertClick={handleInsertClick}
          onRemoveRow={handleRemoveRow}
          openAddRowDialog={openAddRowDialog}
        />

        <GlobalsPanel
          expanded={expandedPanels.globals}
          onToggle={() => handleExpand("globals")}
          globals={globals}
          onAdd={openAddGlobalVariableDialog}
          onEdit={openEditGlobalVariableDialog}
          onRemove={handleRemoveGlobalVariable}
        />

        <VariantsPanel
          expanded={expandedPanels.variants}
          onToggle={() => handleExpand("variants")}
          variants={variants}
          onAdd={openAddVariantDialog}
          onEdit={openEditVariantDialog}
          onRemove={handleRemoveVariant}
        />
      </Box>

      {/* ---------------- DIALOGS ---------------- */}

      {/* Header Extras */}
      <ExtrasDialog
        open={extrasHeadersDialogOpen}
        section="header"
        propExtras={reportMeta.extras}
        onClose={() => setExtrasHeadersDialogOpen(false)}
        onSave={handleSaveExtrasHeaders}
      />

      <AddRowDialog
        open={addRowDialogState.open}
        rowType={addRowDialogState.rowType}
        existingRowIds={existingRowIds}
        onClose={() => setAddRowDialogState({ open: false, rowType: "", insertAt: 0 })}
        onConfirm={handleAddRow}
      />

      <VariantDialog
        open={variantDialogOpen}
        variant={editingVariant}
        tableNames={tableNames}
        dynamicRowIds={dynamicRowIds}
        onClose={() => {
          setVariantDialogOpen(false);
          setEditingVariant(null);
          setEditingVariantIndex(null);
        }}
        onSave={handleSaveVariant}
      />

      <GlobalVariableDialog
        open={globalDialogOpen}
        globalVariable={editingGlobal}
        globals={globals}
        onClose={() => {
          setGlobalDialogOpen(false);
          setEditingGlobal(null);
          setEditingGlobalIndex(null);
        }}
        onSave={handleSaveGlobalVariable}
      />

      <Menu
        anchorEl={insertMenuAnchor}
        open={Boolean(insertMenuAnchor)}
        onClose={() => setInsertMenuAnchor(null)}
      >
        {/* <MenuItem onClick={() => openAddRowDialog("HEADER", insertAtIndex)}>Header</MenuItem> */}
        <MenuItem onClick={() => openAddRowDialog("DATA", insertAtIndex)}>Data</MenuItem>
        {/* <MenuItem onClick={() => openAddRowDialog("SEPARATOR", insertAtIndex)}>Separator</MenuItem> */}
        <MenuItem onClick={() => openAddRowDialog("DYNAMIC", insertAtIndex)}>Dynamic</MenuItem>
        {/* <MenuItem onClick={() => openAddRowDialog("FOOTER", insertAtIndex)}>Footer</MenuItem> */}
      </Menu>
    </Paper>
  );
});

LeftPanel.displayName = "LeftPanel";









// Selector.js

import { createSelector } from "@reduxjs/toolkit";

const selectTemplate = (state) => state.template.present;

export const selectTemplateMeta = createSelector(
  [selectTemplate],
  (template) => template.templateMeta,
);

export const selectReportMeta = createSelector(
  [selectTemplate],
  (template) => template.reportMeta,
);

export const selectColumns = createSelector(
  [selectTemplate],
  (template) => template.columns,
);

export const selectRowOrder = createSelector(
  [selectTemplate],
  (template) => template.rowOrder,
);

export const selectRowsEntities = createSelector(
  [selectTemplate],
  (template) => template.rows,
);

export const selectCellsEntities = createSelector(
  [selectTemplate],
  (template) => template.cells,
);

export const selectRows = createSelector(
  [selectRowOrder, selectRowsEntities, selectCellsEntities],
  (rowOrder, rows, cells) => {
    return rowOrder.map((rowId) => {
      const row = rows[rowId];
      const rowCells = row.cellIds.map((cellId) => cells[cellId]);
      return {
        ...row,
        cells: rowCells,
      };
    });
  },
);

export const selectRowById = createSelector(
  [selectRowsEntities, selectCellsEntities, (_, rowId) => rowId],
  (rows, cells, rowId) => {
    const row = rows[rowId];
    if (!row) return null;
    const rowCells = row.cellIds.map((cellId) => cells[cellId]);
    return {
      ...row,
      cells: rowCells,
    };
  },
);

export const selectVariants = createSelector(
  [selectTemplate],
  (template) => template.variants,
);

export const selectGlobals = createSelector(
  [selectTemplate],
  (template) => template.globalParams,
);

export const selectSelectedCell = createSelector(
  [selectTemplate],
  (template) => template.selectedCell,
);

export const selectFormulaMode = createSelector(
  [selectTemplate],
  (template) => template.formulaMode,
);

export const selectSaving = createSelector(
  [selectTemplate],
  (template) => template.saving,
);

export const selectTemplateSaved = createSelector(
  [selectTemplate],
  (template) => template.templateSaved,
);

export const selectRowCount = createSelector(
  [selectRowOrder],
  (rowOrder) => rowOrder.length,
);

export const selectColumnCount = createSelector(
  [selectColumns],
  (columns) => columns.length,
);

export const selectCellById = createSelector(
  [selectCellsEntities, (_, cellId) => cellId],
  (cells, cellId) => cells[cellId],
);

export const selectSelectedRow = createSelector(
  [selectRowsEntities, selectSelectedCell],
  (rows, selectedCell) => (selectedCell ? rows[selectedCell.rowId] : null),
);

export const selectSelectedCellData = createSelector(
  [selectCellsEntities, selectSelectedCell],
  (cells, selectedCell) => {
    if (!selectedCell) return null;
    return cells[selectedCell.cellId] || null;
  },
);

export const selectSelectedColumn = createSelector(
  [selectColumns, selectSelectedRow, selectCellsEntities, selectSelectedCell],
  (columns, row, cells, selectedCell) => {
    if (!row || !selectedCell) return null;
    const cellIndex = row.cellIds.indexOf(selectedCell.cellId);
    return cellIndex >= 0 ? columns[cellIndex] : null;
  },
);

// Optimized: Build span map once and cache it
const buildSpanMapOptimized = createSelector(
  [selectRowOrder, selectRowsEntities, selectCellsEntities],
  (rowOrder, rows, cells) => {
    const spanMap = new Map();

    for (let rowIndex = 0; rowIndex < rowOrder.length; rowIndex++) {
      const rowId = rowOrder[rowIndex];
      const row = rows[rowId];

      if (row.rowType === "DYNAMIC") continue;

      for (let cellIndex = 0; cellIndex < row.cellIds.length; cellIndex++) {
        const cellId = row.cellIds[cellIndex];
        const cell = cells[cellId];

        if (!cell) continue;

        const colspan = cell.render?.colspan || 1;
        const rowspan = cell.render?.rowspan || 1;

        if (colspan > 1 || rowspan > 1) {
          spanMap.set(`${rowId}-${cellId}`, {
            colspan,
            rowspan,
            rowIndex,
            cellIndex,
          });
        }
      }
    }

    return spanMap;
  },
);

// Optimized: Use the cached span map
export const selectHiddenCells = createSelector(
  [selectRowOrder, selectRowsEntities, buildSpanMapOptimized],
  (rowOrder, rows, spanMap) => {
    const hidden = new Set();

    // Iterate through cells with spans only (much faster)
    spanMap.forEach((span, key) => {
      const [rowId, cellId] = key.split("-");
      const { colspan, rowspan, rowIndex, cellIndex } = span;
      const row = rows[rowId];

      // Hide cells affected by colspan
      for (let c = 1; c < colspan; c++) {
        const hiddenCellId = row.cellIds[cellIndex + c];
        if (hiddenCellId) {
          hidden.add(`${rowId}-${hiddenCellId}`);
        }
      }

      // Hide cells affected by rowspan
      for (let r = 1; r < rowspan; r++) {
        const targetRowId = rowOrder[rowIndex + r];
        if (!targetRowId) continue;

        const targetRow = rows[targetRowId];
        if (!targetRow || targetRow.rowType === "DYNAMIC") continue;

        for (let c = 0; c < colspan; c++) {
          const hiddenCellId = targetRow.cellIds[cellIndex + c];
          if (hiddenCellId) {
            hidden.add(`${targetRowId}-${hiddenCellId}`);
          }
        }
      }
    });

    return hidden;
  },
);

// export const selectTableNames = createSelector(
//   [selectRowsEntities, selectCellsEntities],
//   (rows, cells) => {
//     const tables = new Set();

//     Object.values(rows).forEach((row) => {
//       row.cellIds.forEach((cellId) => {
//         const cell = cells[cellId];
//         if (cell?.source?.table) {
//           tables.add(cell.source.table);
//         }

//       });

//       if (row.dynamicConfig?.table) {
//         tables.add(row.dynamicConfig.table);
//       }
//     });

//     return Array.from(tables);
//   },
// );

export const selectTableNames = createSelector(
  [selectRowsEntities, selectCellsEntities],
  (rows, cells) => {
    const tables = new Set();

    Object.values(rows).forEach((row) => {
      // 1. Extract table from Row Dynamic Config
      if (row.dynamicConfig?.table) {
        tables.add(row.dynamicConfig.table);
      }

      // 2. Iterate through cells associated with the row
      if (Array.isArray(row.cellIds)) {
        row.cellIds.forEach((cellId) => {
          const cell = cells[cellId];

          if (!cell) return;

          // A. Extract table from Cell Source
          if (cell.source?.table) {
            tables.add(cell.source.table);
          }

          // B. Extract tables from Cell Variables
          // We check if variables exist and iterate over the values (e.g., variable N, M, etc.)
          if (cell.variables) {
            Object.values(cell.variables).forEach((variable) => {
              // Ensure variable is an object and has a table property
              if (variable && typeof variable === "object" && variable.table) {
                tables.add(variable.table);
              }
            });
          }
        });
      }
    });

    return Array.from(tables);
  },
);

export const selectDynamicRowIds = createSelector(
  [selectRowsEntities],
  (rows) =>
    Object.values(rows)
      .filter((row) => row.rowType === "DYNAMIC")
      .map((row) => row.id),
);

export const selectExistingRowIds = createSelector(
  [selectRowOrder],
  (rowOrder) => rowOrder,
);

export const selectTemplateForExport = createSelector(
  [
    selectTemplateMeta,
    selectReportMeta,
    selectColumns,
    selectRows,
    selectVariants,
    selectGlobals,
  ],
  (templateMeta, reportMeta, columns, rows, variants, globalParams) => {
    const formattedColumns = columns.map((col) => ({
      id: col.id,
      name: col.name,
      format: col.format ? { ...col.format } : { width: 150, align: "left" },
      templateColumnFilters: col.templateColumnFilters,
    }));

    // Format rows with cells array (remove cells property, use inline structure)
    const formattedRows = rows.map((row) => {
      if (row.rowType === "DYNAMIC") {
        return {
          rowType: row.rowType,
          id: row.id,
          dynamicConfig: row.dynamicConfig,
        };
      }

      return {
        rowType: row.rowType,
        id: row.id,
        cells: row.cells.map((cell) => {
          const formattedCell = {
            type: cell.type,
          };

          if (cell.value !== undefined) {
            formattedCell.value = cell.value;
          }

          if (cell.source) {
            formattedCell.source = cell.source;
          }

          if (cell.expression) {
            formattedCell.expression = cell.expression;
          }

          if (cell.variables) {
            formattedCell.variables = cell.variables;
          }

          if (cell.render) {
            formattedCell.render = cell.render;
          }

          if (cell.format) {
            formattedCell.format = cell.format;
          }

          return formattedCell;
        }),
      };
    });

    return {
      templateMeta,
      reportMeta,
      reportData: {
        columns: formattedColumns,
        rows: formattedRows,
      },
      variants,
      globalParams,
    };
  },
);

export const selectTemplateColumns = createSelector(
  [selectColumns],
  (columns) => columns.map((col) => ({ id: col.id, name: col.name })),
);

export const selectRowHeights = createSelector(
  [selectTemplate],
  (template) => template.rowHeights,
);

export const selectRowHeight = createSelector(
  [selectRowsEntities, (_, rowId) => rowId],
  (rows, rowId) => rows[rowId]?.height || 60,
);








// templateSlice.js

import { createSlice, nanoid } from "@reduxjs/toolkit";

export const PDF_WIDTH_MULTIPLIER = 0.75;
export const DEFAULT_RELATIVE_WIDTH = 1;

const getInitialState = () => ({
  templateMeta: {
    templateId: "",
    version: 1,
    pageSize: "A4",
    pageOrientation: "portrait",
  },
  reportMeta: {
    reportName: "",
    reportId: "",
    extras: [
      // { name: "Report Date", value: "4545" },
    ],
  },
  columns: [],
  rowOrder: [],
  rows: {},
  cells: {},
  variants: [],
  globalParams: [],
  selectedCell: null,
  formulaMode: false,
  templateSaved: false,
  saving: false,
  rowHeights: {},
});

const initialState = getInitialState();

const templateSlice = createSlice({
  name: "template",
  initialState,
  reducers: {
    setTemplate: (state, action) => {
      const { templateMeta, reportMeta, reportData, variants, globalParams } =
        action.payload;

      state.templateMeta = templateMeta;
      state.reportMeta = reportMeta;
      state.columns = reportData.columns;
      state.variants = variants;
      state.globalParams = globalParams;

      const newCells = {};
      const newRows = {};
      const newRowOrder = [];

      reportData.rows.forEach((row) => {
        const rowId = row.id;
        newRowOrder.push(rowId);

        const cellIds = [];
        if (row.rowType !== "DYNAMIC" && row.cells) {
          row.cells.forEach((cell) => {
            const cellId = cell.id || nanoid();
            cellIds.push(cellId);
            newCells[cellId] = { ...cell, id: cellId };
          });
        }

        newRows[rowId] = {
          id: rowId,
          rowType: row.rowType,
          cellIds,
          dynamicConfig: row.dynamicConfig,
          height: row.height || 60,
        };
      });

      state.cells = newCells;
      state.rows = newRows;
      state.rowOrder = newRowOrder;
    },

    setTemplateMeta: (state, action) => {
      state.templateMeta = { ...state.templateMeta, ...action.payload };
    },

    setReportMeta: (state, action) => {
      state.reportMeta = { ...state.reportMeta, ...action.payload };
    },

    addColumn: (state) => {
      const newColumn = {
        id: `C__${state.columns.length + 1}`,
        name: `Column ${state.columns.length + 1}`,
        format: {},
      };
      state.columns.push(newColumn);

      state.rowOrder.forEach((rowId) => {
        const row = state.rows[rowId];
        if (row.rowType !== "DYNAMIC") {
          const newCellId = nanoid();
          row.cellIds.push(newCellId);
          state.cells[newCellId] = {
            id: newCellId,
            type: "TEXT",
            value: "",
          };
        }
      });
    },

    updateColumn: (state, action) => {
      const { index, column } = action.payload;
      if (state.columns[index]) {
        state.columns[index] = { ...state.columns[index], ...column };
      }
    },

    updateColumnFormat: (state, action) => {
      const { index, format } = action.payload;
      if (state.columns[index]) {
        state.columns[index] = {
          ...state.columns[index],
          format: { ...state.columns[index].format, ...format },
        };
      }
    },

    removeColumn: (state, action) => {
      const { colId, index } = action.payload;
      state.columns = state.columns.filter((c) => c.id !== colId);

      state.rowOrder.forEach((rowId) => {
        const row = state.rows[rowId];
        if (row.rowType !== "DYNAMIC" && row.cellIds.length > index) {
          const removedCellId = row.cellIds[index];
          delete state.cells[removedCellId];
          row.cellIds.splice(index, 1);
        }
      });
    },

    addRow: (state, action) => {
      const { row, insertAt } = action.payload;
      const rowId = row.id;

      const cellIds = [];
      if (row.rowType !== "DYNAMIC") {
        state.columns.forEach(() => {
          const cellId = nanoid();
          cellIds.push(cellId);
          state.cells[cellId] = {
            id: cellId,
            type: "TEXT",
            value: "",
          };
        });
      }

      state.rows[rowId] = {
        id: rowId,
        rowType: row.rowType,
        cellIds,
        dynamicConfig: row.dynamicConfig,
        height: 60,
      };

      if (insertAt !== undefined) {
        state.rowOrder.splice(insertAt, 0, rowId);
      } else {
        state.rowOrder.push(rowId);
      }
    },

    updateRow: (state, action) => {
      const { rowId, row } = action.payload;
      if (state.rows[rowId]) {
        state.rows[rowId] = { ...state.rows[rowId], ...row };
      }
    },

    removeRow: (state, action) => {
      const { rowId } = action.payload;
      const row = state.rows[rowId];

      if (row) {
        row.cellIds.forEach((cellId) => {
          delete state.cells[cellId];
        });
        delete state.rows[rowId];
        delete state.rowHeights[rowId];
        state.rowOrder = state.rowOrder.filter((id) => id !== rowId);
      }
    },

    reorderRows: (state, action) => {
      const { fromIndex, toIndex } = action.payload;
      const [removed] = state.rowOrder.splice(fromIndex, 1);
      state.rowOrder.splice(toIndex, 0, removed);
    },

    updateCell: (state, action) => {
      const { cellId, cell } = action.payload;
      if (state.cells[cellId]) {
        state.cells[cellId] = { ...state.cells[cellId], ...cell };
      }
    },

    updateCellRender: (state, action) => {
      const { cellId, render } = action.payload;
      if (state.cells[cellId]) {
        state.cells[cellId].render = {
          ...state.cells[cellId].render,
          ...render,
        };
      }
    },

    updateCellFormat: (state, action) => {
      const { cellId, format } = action.payload;
      if (state.cells[cellId]) {
        state.cells[cellId].format = {
          ...state.cells[cellId].format,
          ...format,
        };
      }
    },

    updateCellSource: (state, action) => {
      const { cellId, source } = action.payload;
      if (state.cells[cellId]) {
        state.cells[cellId].source = {
          ...state.cells[cellId].source,
          ...source,
        };
      }
    },

    updateDynamicConfig: (state, action) => {
      const { rowId, config } = action.payload;
      if (state.rows[rowId]) {
        state.rows[rowId].dynamicConfig = {
          ...state.rows[rowId].dynamicConfig,
          ...config,
        };
      }
    },

    setSelectedCell: (state, action) => {
      state.selectedCell = action.payload;
    },

    setFormulaMode: (state, action) => {
      state.formulaMode = action.payload;
    },

    setVariants: (state, action) => {
      state.variants = action.payload;
    },

    addVariant: (state, action) => {
      state.variants.push(action.payload);
    },

    updateVariant: (state, action) => {
      const { index, variant } = action.payload;
      if (state.variants[index]) {
        state.variants[index] = variant;
      }
    },

    removeVariant: (state, action) => {
      state.variants.splice(action.payload, 1);
    },

    setGlobalParams: (state, action) => {
      state.globalParams = action.payload;
    },

    addGlobalVariable: (state, action) => {
      state.globalParams.push(action.payload);
    },

    updateGlobalVariable: (state, action) => {
      const { index, global } = action.payload;
      if (state.globalParams[index]) {
        state.globalParams[index] = global;
      }
    },

    removeGlobalVariable: (state, action) => {
      state.globalParams.splice(action.payload, 1);
    },

    setSaving: (state, action) => {
      state.saving = action.payload;
    },

    setTemplateSaved: (state, action) => {
      state.templateSaved = action.payload;
    },

    setRowHeight: (state, action) => {
      const { rowId, height } = action.payload;
      state.rowHeights[rowId] = height;
      if (state.rows[rowId]) {
        state.rows[rowId].height = height;
      }
    },

    resetTemplate: () => getInitialState(),
  },
});

export const {
  setTemplate,
  setTemplateMeta,
  setReportMeta,
  addColumn,
  updateColumn,
  updateColumnFormat,
  removeColumn,
  addRow,
  updateRow,
  removeRow,
  reorderRows,
  updateCell,
  updateCellRender,
  updateCellFormat,
  updateCellSource,
  updateDynamicConfig,
  setSelectedCell,
  setFormulaMode,
  setVariants,
  addVariant,
  updateVariant,
  removeVariant,
  setGlobalParams,
  addGlobalVariable,
  updateGlobalVariable,
  removeGlobalVariable,
  setSaving,
  setTemplateSaved,
  setRowHeight,
  resetTemplate,
} = templateSlice.actions;

export default templateSlice.reducer;
