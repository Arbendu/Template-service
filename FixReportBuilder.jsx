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
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import { IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

export const AddRowDialog = ({
  open,
  rowType,
  existingRowIds = [], // Array of row IDs in their current visual order
  onClose,
  onConfirm,
}) => {
  // ID Generation State
  const [customId, setCustomId] = useState("");
  const [error, setError] = useState("");
  const [generatedId, setGeneratedId] = useState("");

  // Placement & Copy State
  const [position, setPosition] = useState("BOTTOM");
  const [targetRowId, setTargetRowId] = useState("");
  const [isCopying, setIsCopying] = useState(false);
  const [copySourceId, setCopySourceId] = useState("");

  // O(1) lookup table for instant collision detection
  const existingIdsSet = useMemo(() => {
    return new Set(existingRowIds);
  }, [existingRowIds]);

  const generateUniqueID = () => {
    let newId;
    let isUnique = false;
    let numAttempts = 0;
    const MAX_NUMERIC_ATTEMPTS = 15;
    const randomBuffer = new Uint32Array(1);

    // Phase 1: Exhaust 5-Digit Numerical IDs
    while (!isUnique && numAttempts < MAX_NUMERIC_ATTEMPTS) {
      window.crypto.getRandomValues(randomBuffer);
      const numericPart = (randomBuffer[0] % 100000).toString().padStart(5, "0");
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
        window.crypto.getRandomValues(randomBuffer);
        const alphaPart = randomBuffer[0].toString(36).substring(0, 5).padEnd(5, "0");
        newId = `R__${alphaPart}`;

        if (!existingIdsSet.has(newId)) {
          isUnique = true;
        }
        alphaAttempts++;
      }
    }

    // Phase 3: Absolute Fallback
    if (!isUnique) {
      let counter = 0;
      do {
        const fallbackPart = (Date.now() + counter).toString(36).slice(-5).padStart(5, "0");
        newId = `R__${fallbackPart}`;
        counter++;
      } while (existingIdsSet.has(newId));
    }

    return newId;
  };

  // Reset dialog state on open
  useEffect(() => {
    if (open) {
      const newId = generateUniqueID();
      setGeneratedId(newId);
      setCustomId("");
      setError("");
      setPosition("BOTTOM");
      setTargetRowId("");
      setIsCopying(false);
      setCopySourceId("");
    }
  }, [open, existingIdsSet]);

  const validateId = (id) => {
    if (!id.trim() || id === "R__") return null;
    if (/\s/.test(id)) return "Row ID cannot contain spaces";
    if (!/^R__[a-zA-Z0-9_]+$/.test(id)) {
      return "Row ID can only contain letters, numbers, and underscores";
    }
    if (existingIdsSet.has(id)) return "This Row ID already exists";
    return null;
  };

  const handleIdChange = (value) => {
    setCustomId(value);
    const idToValidate = value.startsWith("R__") ? value : "R__" + value;
    const validationError = validateId(idToValidate);
    setError(validationError || "");
  };

  const isFormValid = () => {
    if (error) return false;
    if ((position === "ABOVE" || position === "BELOW") && !targetRowId) return false;
    if (isCopying && !copySourceId) return false;
    return true;
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

    // Pass the structured configuration back to the parent
    onConfirm({
      id: finalId,
      rowType,
      position,
      targetRowId: (position === "ABOVE" || position === "BELOW") ? targetRowId : null,
      copySourceId: isCopying ? copySourceId : null,
    });
    
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
        <IconButton onClick={handleClose} sx={{ position: "absolute", right: 16, top: 10 }}>
          <CloseIcon />
        </IconButton>
        <Typography variant="h6" fontWeight={600}>Add {rowType} Row</Typography>
      </DialogTitle>
      
      <DialogContent dividers>
        <Stack spacing={4} sx={{ mt: 1 }}>
          
          {/* SECTION 1: Row ID */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              1. Unique Identifier
            </Typography>
            <TextField
              label="Row ID (optional)"
              value={customId}
              onChange={(e) => handleIdChange(e.target.value)}
              placeholder="e.g., 04512, header_row"
              error={!!error}
              helperText={error || "Leave empty to use the secure auto-generated ID"}
              fullWidth
              autoFocus
              size="small"
            />
            <Box sx={{ mt: 1 }}>
              {!customId.trim() && !error && (
                <Alert severity="info" sx={{ py: 0, '& .MuiAlert-message': { p: 1 } }}>
                  Suggested ID: <strong>{generatedId}</strong>
                </Alert>
              )}
              {customId.trim() && !error && (
                <Alert severity="success" sx={{ py: 0, '& .MuiAlert-message': { p: 1 } }}>
                  Valid ID: <strong>{displayedId}</strong>
                </Alert>
              )}
            </Box>
          </Box>

          <Divider />

          {/* SECTION 2: Placement */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              2. Row Placement
            </Typography>
            <RadioGroup
              row
              value={position}
              onChange={(e) => {
                setPosition(e.target.value);
                if (e.target.value === "TOP" || e.target.value === "BOTTOM") {
                  setTargetRowId("");
                }
              }}
            >
              <FormControlLabel value="BOTTOM" control={<Radio size="small" />} label="Bottom" />
              <FormControlLabel value="TOP" control={<Radio size="small" />} label="Top" />
              <FormControlLabel value="ABOVE" control={<Radio size="small" />} label="Above..." />
              <FormControlLabel value="BELOW" control={<Radio size="small" />} label="Below..." />
            </RadioGroup>

            {(position === "ABOVE" || position === "BELOW") && (
              <FormControl fullWidth size="small" sx={{ mt: 2 }} error={!targetRowId}>
                <InputLabel>Select Target Row</InputLabel>
                <Select
                  value={targetRowId}
                  label="Select Target Row"
                  onChange={(e) => setTargetRowId(e.target.value)}
                >
                  {existingRowIds.map((id) => (
                    <MenuItem key={id} value={id}>
                      {id}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>

          <Divider />

          {/* SECTION 3: Cloning/Copying */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              3. Data Configuration (Optional)
            </Typography>
            <FormControlLabel
              control={
                <Switch 
                  checked={isCopying} 
                  onChange={(e) => {
                    setIsCopying(e.target.checked);
                    if (!e.target.checked) setCopySourceId("");
                  }} 
                />
              }
              label="Duplicate existing row structure"
            />

            {isCopying && (
              <FormControl fullWidth size="small" sx={{ mt: 2 }} error={!copySourceId}>
                <InputLabel>Select Row to Copy</InputLabel>
                <Select
                  value={copySourceId}
                  label="Select Row to Copy"
                  onChange={(e) => setCopySourceId(e.target.value)}
                >
                  {existingRowIds.map((id) => (
                    <MenuItem key={id} value={id}>
                      {id}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} color="inherit">
          Cancel
        </Button>
        <Button 
          onClick={handleConfirm} 
          variant="contained" 
          disabled={!isFormValid()}
          disableElevation
        >
          Create Row
        </Button>
      </DialogActions>
    </Dialog>
  );
};













  const handleAddRow = useCallback(
    (rowConfig) => {
      const { id, rowType, position, targetRowId, copySourceId } = rowConfig;
      
      // 1. Calculate the exact insertion index based on user selection
      let calculatedInsertAt = rows.length; // Default BOTTOM
      
      if (position === "TOP") {
        calculatedInsertAt = 0;
      } else if (position === "ABOVE" && targetRowId) {
        calculatedInsertAt = rows.findIndex(r => r.id === targetRowId);
        if (calculatedInsertAt === -1) calculatedInsertAt = 0;
      } else if (position === "BELOW" && targetRowId) {
        calculatedInsertAt = rows.findIndex(r => r.id === targetRowId) + 1;
        if (calculatedInsertAt === 0) calculatedInsertAt = rows.length;
      }

      // 2. Setup the new row object
      const newRow = { id, rowType };

      // 3. Handle specific row type initialization
      if (rowType === "DYNAMIC") {
        newRow.dynamicConfig = {
          type: "DB_LIST",
          table: "",
          select: [],
          filters: {},
          columnMappings: [],
        };
      }

      // 4. Dispatch the add action
      // Note: If copySourceId exists, you will need to map that logic into your Redux slice
      // e.g., dispatch(addRow({ row: newRow, insertAt: calculatedInsertAt, copyFrom: copySourceId }));
      dispatch(addRow({ row: newRow, insertAt: calculatedInsertAt }));
      
      // 5. Close dialog
      setAddRowDialogState({ open: false, rowType: "", insertAt: 0 });
    },
    [dispatch, rows]
  );
