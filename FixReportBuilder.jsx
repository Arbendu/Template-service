
import { useCallback, useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ActionCreators } from "redux-undo";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Backdrop from "@mui/material/Backdrop";

import { ReportCanvas } from "./components/editor/ReportCanvas";
import { TopToolbar } from "./components/editor/TopToolbar";
import { LeftPanel } from "./components/leftpanel/LeftPanel";
import { RightPanel } from "./components/rightpanel/RightPanel";
import { ImportTemplateDialog } from "./components/editor/ImportTemplateDialog";
import ExportTemplateDialog from "./components/editor/ExportTemplateDialog";

// ---> STEP A: IMPORT THE NEW DIALOG HERE <---
import SaveTemplateDialog from "./components/dialogs/SaveTemplateDialog";

import { fetchTableConfigs, fetchTemplate, saveTemplate, saveVariants } from "./services/api";
import { useAppDispatch, useAppSelector } from "./store";
import { generateBulkTestData } from "./utils/testDataGenerator";
import { setTemplate, setTemplateMeta, setSelectedCell, setSaving, setTemplateSaved, resetTemplate } from "./store/templateSlice";
import { enterComponentFullscreen, exitComponentFullscreen } from "../../store/slices/uiSlice";
import { setLoading, setTableConfigs, setError } from "./store/configSlice";
import { selectTemplateMeta, selectReportMeta, selectVariants, selectSaving, selectTemplateSaved, selectTemplateForExport } from "./store/selectors";
import useApi from "../../hooks/useApi";
import useCustomSnackbar from "../../utils/useCustomSnackbar";

const UndoRedoHandler = () => {
  // ... your existing UndoRedoHandler code ...
  return null;
};

const ReportBuilderComponent = ({ setShowComponentTitle, templateId, onBack }) => {
  const dispatch = useAppDispatch();
  const normalDispatch = useDispatch();
  const showSnackBar = useCustomSnackbar();

  const templateMeta = useAppSelector(selectTemplateMeta);
  const reportMeta = useAppSelector(selectReportMeta);
  const variants = useAppSelector(selectVariants);
  const saving = useAppSelector(selectSaving);
  const templateSaved = useAppSelector(selectTemplateSaved);
  const templateForExport = useAppSelector(selectTemplateForExport);
  const isFullscreen = useSelector((state) => state.ui.isComponentFullscreen);

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  
  // ---> STEP B (Part 1): ADD THE DIALOG STATE HERE <---
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);

  const componentRef = useRef(null);
  const { callApi } = useApi();

  // ... your existing useEffects (initialization, etc.) ...

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      normalDispatch(exitComponentFullscreen());
    } else {
      normalDispatch(enterComponentFullscreen());
    }
  }, [isFullscreen, normalDispatch]);


  // ---> STEP B (Part 2): REPLACE handleSaveTemplate WITH THESE TWO FUNCTIONS <---
  
  // Function 1: Only opens the dialog when user clicks "Save Template"
  const handleSaveClick = useCallback(() => {
    setCommentDialogOpen(true);
  }, []);

  // Function 2: Actually calls the API once the user types a comment and clicks "Confirm"
  const confirmSaveTemplate = useCallback(async (remarks) => {
    setCommentDialogOpen(false); // Close the dialog
    dispatch(setSaving(true));
    
    // Add 'remarks' to the payload
    const result = await saveTemplate(callApi, {
      template: templateForExport,
      variants,
      remarks: remarks 
    });
    
    dispatch(setSaving(false));

    if (result.success) {
      dispatch(setTemplateSaved(true));
      if (result.templateId) {
        dispatch(setTemplateMeta({ templateId: result.templateId }));
      }
      showSnackBar("Save request created successfully", "success");
    } else {
      showSnackBar(result.error || "Failed to save template", "error");
    }
  }, [callApi, dispatch, showSnackBar, templateForExport, variants]);

  // ---> END OF STEP B <---


  const handleSaveVariants = useCallback(async () => {
    // ... your existing handleSaveVariants code ...
  }, [templateSaved, templateMeta.templateId, dispatch, callApi, variants]);

  const fetchTemplateByTemplateId = useCallback(async (templateId) => {
    // ... your existing fetchTemplateByTemplateId code ...
  }, [callApi, showSnackBar]);

  const handleImport = useCallback((data) => {
    // ... your existing handleImport code ...
  }, [dispatch]);

  const handleGenerateTestData = useCallback((rowCount) => {
    // ... your existing handleGenerateTestData code ...
  }, [dispatch]);

  return (
    <Box ref={componentRef} sx={{ position: "relative" }}>
      <UndoRedoHandler />
      <Backdrop sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }} open={editorLoading}>
        <Box sx={{ textAlign: "center" }}>
          <CircularProgress color="inherit" />
          <Box mt={2}>Loading Editor...</Box>
        </Box>
      </Backdrop>

      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        
        {/* ---> STEP C (Part 1): PASS handleSaveClick TO THE TOOLBAR <--- */}
        <TopToolbar
          onBack={onBack}
          onExport={() => setExportDialogOpen(true)}
          onSave={handleSaveClick} // <-- Changed this line to trigger the dialog
          onSaveVariants={handleSaveVariants}
          onImport={() => setImportDialogOpen(true)}
          onGenerateTestData={handleGenerateTestData}
          reportName={reportMeta?.reportName}
          saving={saving}
          templateSaved={templateSaved}
          variantsCount={variants.length}
          isFullscreen={isFullscreen}
          toggleFullscreen={toggleFullscreen}
        />

        <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <LeftPanel />
          <ReportCanvas />
          <RightPanel />
        </Box>
      </Box>

      <ImportTemplateDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImport={handleImport}
        fetchTemplateByTemplateId={fetchTemplateByTemplateId}
      />
      <ExportTemplateDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        templateId={templateMeta?.templateId}
        templateForExport={templateForExport}
        variants={variants}
        reportName={reportMeta?.reportName}
        callApi={callApi}
      />

      {/* ---> STEP C (Part 2): ADD THE DIALOG COMPONENT AT THE BOTTOM <--- */}
      <SaveTemplateDialog
        open={commentDialogOpen}
        onClose={() => setCommentDialogOpen(false)}
        onConfirm={confirmSaveTemplate}
        saving={saving}
      />

    </Box>
  );
};

export default ReportBuilderComponent;
















import React, { useState, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

const SaveTemplateDialog = ({ open, onClose, onConfirm, saving }) => {
  const [comment, setComment] = useState("");

  // Clear the comment field whenever the dialog opens
  useEffect(() => {
    if (open) {
      setComment("");
    }
  }, [open]);

  const handleConfirm = () => {
    if (comment.trim().length >= 5) {
      onConfirm(comment.trim());
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={!saving ? onClose : undefined} 
      maxWidth="sm" 
      fullWidth
    >
      <DialogTitle>Save Template Request</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Maker Remarks / Comments"
            placeholder="Please describe the changes you made..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            variant="outlined"
            autoFocus
            disabled={saving}
            helperText={
              comment.trim().length > 0 && comment.trim().length < 5 
                ? "Minimum 5 characters required" 
                : ""
            }
            error={comment.trim().length > 0 && comment.trim().length < 5}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={saving || comment.trim().length < 5}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {saving ? "Saving..." : "Confirm Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SaveTemplateDialog;
