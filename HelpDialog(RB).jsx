// HelpDialog.jsx
//
// Self-contained "Help & Documentation" dialog for the Report Template
// Builder. Drop this file next to TopToolbar.jsx and wire it up as shown
// at the bottom of this file (search "HOW TO WIRE THIS UP").
//
// Zero new external dependencies — only @mui/material + @mui/icons-material,
// which the app already uses everywhere else.

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  IconButton,
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  TextField,
  InputAdornment,
  Chip,
  Alert,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import ViewAgendaIcon from "@mui/icons-material/ViewAgenda";
import TuneIcon from "@mui/icons-material/Tune";
import FunctionsIcon from "@mui/icons-material/Functions";
import FilterListIcon from "@mui/icons-material/FilterList";
import StorageIcon from "@mui/icons-material/Storage";
import SettingsIcon from "@mui/icons-material/Settings";
import SaveIcon from "@mui/icons-material/Save";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";

/* ───────────────────────── helpers ───────────────────────── */

/** A single numbered step ("1. Click on Variants...") */
const Step = ({ index, children }) => {
  const theme = useTheme();
  return (
    <Box sx={{ display: "flex", gap: 1.5, mb: 1.25 }}>
      <Box
        sx={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: "50%",
          bgcolor: alpha(theme.palette.primary.main, 0.12),
          color: "primary.main",
          fontSize: "0.72rem",
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mt: 0.15,
        }}
      >
        {index}
      </Box>
      <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
        {children}
      </Typography>
    </Box>
  );
};

/** An ordered "how to" walkthrough */
const StepList = ({ steps }) => (
  <Box sx={{ mb: 2 }}>
    {steps.map((s, i) => (
      <Step key={i} index={i + 1}>
        {s}
      </Step>
    ))}
  </Box>
);

/** A labelled inline UI reference, e.g. <UiLabel>Add Variant</UiLabel> */
const UiLabel = ({ children }) => (
  <Box
    component="span"
    sx={{
      fontFamily: "monospace",
      fontSize: "0.8rem",
      fontWeight: 700,
      bgcolor: "action.selected",
      px: 0.6,
      py: 0.1,
      borderRadius: 0.75,
    }}
  >
    {children}
  </Box>
);

const SubHeading = ({ children }) => (
  <Typography
    variant="subtitle2"
    fontWeight={700}
    sx={{ mt: 2.5, mb: 1, color: "text.primary" }}
  >
    {children}
  </Typography>
);

/* ───────────────────────── content ───────────────────────── */
// Every step below references the actual button / accordion labels that
// exist in the app, so this doubles as an always-accurate cheat sheet.
// To add a new topic, just push another object into HELP_TOPICS.

const HELP_TOPICS = [
  {
    id: "overview",
    label: "Overview",
    icon: DashboardIcon,
    render: () => (
      <>
        <Typography variant="body2" sx={{ mb: 2 }}>
          The Report Template Builder has three areas: the{" "}
          <strong>Left Panel</strong> ("Report Structure") for defining what
          your report contains, the <strong>Canvas</strong> in the middle for
          viewing and selecting cells, and the <strong>Right Panel</strong>{" "}
          ("Cell Properties") for configuring whatever cell you have
          selected.
        </Typography>
        <SubHeading>Left Panel — Report Structure</SubHeading>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Five collapsible sections, top to bottom:
        </Typography>
        <StepList
          steps={[
            <>
              <strong>Report Metadata</strong> — template/report name and
              extra header key-value pairs.
            </>,
            <>
              <strong>Columns</strong> — define each column of the report and
              its display format.
            </>,
            <>
              <strong>Rows</strong> — add and reorder Data or Dynamic rows.
            </>,
            <>
              <strong>Global Variables</strong> — values shared across every
              cell/formula in the template.
            </>,
            <>
              <strong>Variants</strong> — parameterised versions of the same
              report.
            </>,
          ]}
        />
        <SubHeading>Right Panel — Cell Properties</SubHeading>
        <Typography variant="body2" color="text.secondary">
          Click any cell in the canvas to select it — the Right Panel then
          shows its Cell Type, DB Source (if applicable), Formatting and Cell
          Format options. Click a Dynamic row instead of a cell to configure
          that row's database binding.
        </Typography>
      </>
    ),
  },

  {
    id: "columns",
    label: "Columns & Formatting",
    icon: ViewColumnIcon,
    render: () => (
      <>
        <SubHeading>Add a column</SubHeading>
        <StepList
          steps={[
            <>
              In the Left Panel, click <UiLabel>Columns</UiLabel> to expand
              the section.
            </>,
            <>
              Click the add-column control at the top of the section — a new
              column appears in the list, "Untitled Column" by default.
            </>,
            <>
              Click the new column's header row to expand its editor.
            </>,
          ]}
        />
        <SubHeading>Configure the column</SubHeading>
        <StepList
          steps={[
            <>
              Set <UiLabel>Column Display Name</UiLabel> (e.g. "Account
              Balance") and, optionally, <UiLabel>Column Width</UiLabel> (used
              for PDF export).
            </>,
            <>
              Choose the <UiLabel>Data Type</UiLabel> dropdown: Text /
              Default, Currency, Number, or Date.
            </>,
            <>
              Use the <UiLabel>Align</UiLabel> toggle (Left / Center / Right)
              and the <strong>Bold</strong> toggle for PDF rendering.
            </>,
          ]}
        />
        <SubHeading>Type-specific options</SubHeading>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Once you pick a data type, extra options appear underneath:
        </Typography>
        <StepList
          steps={[
            <>
              <strong>Currency</strong> — set <UiLabel>Decimals</UiLabel>{" "}
              (0–10) and toggle <UiLabel>Thousand Separator</UiLabel>.
            </>,
            <>
              <strong>Number</strong> — same as Currency: decimals + thousand
              separator.
            </>,
            <>
              <strong>Date</strong> — pick a preset from{" "}
              <UiLabel>Date Format</UiLabel> (e.g. dd-MMM-yyyy) or choose a
              custom pattern.
            </>,
          ]}
        />
        <SubHeading>Column-level DB filters</SubHeading>
        <StepList
          steps={[
            <>
              In the expanded column editor, find the{" "}
              <strong>Column Filters</strong> row at the bottom.
            </>,
            <>
              Click <UiLabel>Add</UiLabel> (or <UiLabel>Edit</UiLabel> if
              filters already exist) to open the source dialog and restrict
              which database tables/conditions apply to this column.
            </>,
          ]}
        />
      </>
    ),
  },

  {
    id: "rows",
    label: "Rows",
    icon: ViewAgendaIcon,
    render: () => (
      <>
        <SubHeading>Add a row</SubHeading>
        <StepList
          steps={[
            <>
              In the Left Panel, click <UiLabel>Rows</UiLabel> to expand the
              section.
            </>,
            <>
              Click <UiLabel>Add Data Row</UiLabel> for a normal row with one
              cell per column, or <UiLabel>Add Dynamic Row</UiLabel> for a row
              that generates multiple rows at runtime from a database query.
            </>,
            <>
              In the dialog that opens, choose where to insert the row and,
              optionally, copy the setup from an existing row of the same
              type. Confirm to add it.
            </>,
          ]}
        />
        <SubHeading>Reorder & manage rows</SubHeading>
        <StepList
          steps={[
            <>
              Drag a row in the list to reorder it — drop it where you want it
              to land.
            </>,
            <>
              Hover a row and use its insert icon to add a new row
              immediately after it (choose Data or Dynamic from the menu that
              appears).
            </>,
            <>
              Use the delete icon on a row to remove it from the report.
            </>,
          ]}
        />
        <Alert severity="info" sx={{ mt: 1 }}>
          Dynamic rows can't be referenced in formulas and can't be selected
          in Formula Builder's "Select Cell from Canvas" mode, since they
          expand into an unknown number of rows at report-run time.
        </Alert>
      </>
    ),
  },

  {
    id: "cell-properties",
    label: "Cell Properties",
    icon: SettingsIcon,
    render: () => (
      <>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          Click any non-dynamic cell in the canvas to select it. The Right
          Panel shows four accordion sections for that cell:
        </Typography>
        <SubHeading>Cell Type</SubHeading>
        <StepList
          steps={[
            <>
              Pick the <UiLabel>Cell Type</UiLabel> dropdown: TEXT, FORMULA,
              or a DB_* type.
            </>,
            <>
              <strong>TEXT</strong> — type a static <UiLabel>Text Value</UiLabel>{" "}
              directly.
            </>,
            <>
              <strong>FORMULA</strong> — opens the Formula Builder (see the
              "Formula Builder" topic).
            </>,
          ]}
        />
        <SubHeading>DB Source (DB_* cell types only)</SubHeading>
        <StepList
          steps={[
            <>Select a <UiLabel>Table</UiLabel> from the autocomplete.</>,
            <>
              Select a <UiLabel>Column</UiLabel> from that table — supported
              aggregate functions for the column appear underneath.
            </>,
            <>
              Optionally add filter conditions with the Filter Builder shown
              below the column picker to scope which rows the value is pulled
              from.
            </>,
          ]}
        />
        <SubHeading>Formatting</SubHeading>
        <StepList
          steps={[
            <>Toggle <strong>Bold</strong>.</>,
            <>
              Set <UiLabel>Text Align</UiLabel> (Left / Center / Right).
            </>,
            <>
              Set <UiLabel>Colspan</UiLabel> / <UiLabel>Rowspan</UiLabel> to
              merge this cell across columns or rows.
            </>,
          ]}
        />
        <SubHeading>Cell Format</SubHeading>
        <StepList
          steps={[
            <>
              Choose <UiLabel>Format Type</UiLabel>: None, Currency, Number,
              Date, or Percentage.
            </>,
            <>
              Fill in the type-specific fields that appear (symbol/decimals
              for Currency, decimals + thousand separator for Number, a
              pattern for Date, decimals for Percentage).
            </>,
            <>
              Optionally set a <UiLabel>Background Color</UiLabel>, or click{" "}
              <UiLabel>Reset</UiLabel> to clear it.
            </>,
          ]}
        />
      </>
    ),
  },

  {
    id: "formula",
    label: "Formula Builder",
    icon: FunctionsIcon,
    render: () => (
      <>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          Available whenever a cell's <UiLabel>Cell Type</UiLabel> is set to{" "}
          <strong>FORMULA</strong>.
        </Typography>
        <SubHeading>Build a formula by typing</SubHeading>
        <StepList
          steps={[
            <>
              Type directly into the <UiLabel>EXPRESSION</UiLabel> text area,
              e.g. <code>cell_R__R1_C__C1 + variable1</code>.
            </>,
            <>
              Use the <UiLabel>OPERATORS</UiLabel> row ( + − * / ( ) ) to
              insert operators at the cursor.
            </>,
            <>
              Any validation problems (unbalanced parentheses, undefined
              variables, circular references, references to Dynamic rows)
              show up as an error alert under the expression box.
            </>,
          ]}
        />
        <SubHeading>Insert a cell reference from the canvas</SubHeading>
        <StepList
          steps={[
            <>
              Click <UiLabel>Select Cell from Canvas</UiLabel> — it turns
              orange and reads "Click cells to add (Active)".
            </>,
            <>
              Click any eligible cell in the canvas — its reference is
              appended to the expression automatically.
            </>,
            <>
              Click the button again to turn selection mode off. The current
              cell and any Dynamic rows can't be picked.
            </>,
          ]}
        />
        <SubHeading>Add a variable</SubHeading>
        <StepList
          steps={[
            <>
              Click <UiLabel>Variable</UiLabel> under the INSERT row.
            </>,
            <>
              Give it a <UiLabel>Variable Name</UiLabel> and pick a{" "}
              <UiLabel>Variable Type</UiLabel> (cell reference or a DB value —
              pick a table and column if it's DB-based).
            </>,
            <>
              Save it, then reference the variable by name inside your
              expression.
            </>,
          ]}
        />
        <SubHeading>Use the visual builder instead</SubHeading>
        <StepList
          steps={[
            <>
              Click <UiLabel>Create Visually</UiLabel> to open the Visual
              Formula Editor.
            </>,
            <>
              Build the expression as a node tree instead of raw text, then
              save — it fills in the EXPRESSION box for you.
            </>,
          ]}
        />
      </>
    ),
  },

  {
    id: "filters",
    label: "Filter Builder",
    icon: FilterListIcon,
    render: () => (
      <>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          Appears wherever a value is pulled from the database — inside DB
          Source (Cell Properties), inside Dynamic Row configuration, and
          inside a Variant's filter rules.
        </Typography>
        <SubHeading>Add a condition</SubHeading>
        <StepList
          steps={[
            <>
              Click <UiLabel>Add Condition</UiLabel> (only enabled once a
              table is selected).
            </>,
            <>
              Pick the <UiLabel>Column</UiLabel> to filter on, then the{" "}
              <UiLabel>Operator</UiLabel> (=, !=, &gt;, &lt;, &gt;=, &lt;=,
              LIKE, IN, or the null-checks).
            </>,
            <>
              Enter the <UiLabel>Value</UiLabel>. For <code>IN</code>/
              <code>NOT IN</code>, enter a comma-separated list — there's a
              toggle to control how commas inside a single value are handled.
            </>,
          ]}
        />
        <SubHeading>Remove conditions</SubHeading>
        <StepList
          steps={[
            <>
              Delete a single condition with its row's remove icon.
            </>,
            <>
              Or click <UiLabel>Clear All</UiLabel> to remove every condition
              at once.
            </>,
          ]}
        />
      </>
    ),
  },

  {
    id: "dynamic-rows",
    label: "Dynamic Rows",
    icon: StorageIcon,
    render: () => (
      <>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          A Dynamic row generates one report row per matching database
          record at run time, instead of representing a single fixed row.
        </Typography>
        <StepList
          steps={[
            <>
              Add one via <UiLabel>Add Dynamic Row</UiLabel> in the Rows
              section (see the "Rows" topic), then click it in the canvas to
              select it.
            </>,
            <>
              In the Right Panel, set <UiLabel>Type</UiLabel> to{" "}
              <strong>Database List</strong>, then choose the{" "}
              <UiLabel>Table</UiLabel> to pull rows from.
            </>,
            <>
              Choose which columns to select and map them to your report
              columns, add filter conditions with the Filter Builder, and
              optionally set <UiLabel>Order By</UiLabel> and{" "}
              <UiLabel>Limit</UiLabel>.
            </>,
          ]}
        />
        <Alert severity="info" sx={{ mt: 1 }}>
          Dynamic rows can't be referenced by formulas elsewhere in the
          template and are skipped by cell-selection mode in Formula Builder.
        </Alert>
      </>
    ),
  },

  {
    id: "globals",
    label: "Global Variables",
    icon: FunctionsIcon,
    render: () => (
      <>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          Global variables are shared across every cell and formula in the
          template — useful for a value you'd otherwise have to repeat.
        </Typography>
        <StepList
          steps={[
            <>
              In the Left Panel, expand <UiLabel>Global Variables</UiLabel>.
            </>,
            <>
              Click <UiLabel>Add Global Variable</UiLabel>.
            </>,
            <>
              Pick a <strong>Mode</strong>: <em>Input</em> (a value the user
              types in), <em>Expression</em> (computed from a formula), or{" "}
              <em>Query</em> (pulled from the database).
            </>,
            <>
              Pick a <strong>Type</strong>: Date, String, Number, or Boolean,
              then fill in the mode-specific configuration and save.
            </>,
          ]}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          To change a variable later, click its card to reopen the editor.
          Remove it with the card's delete icon.
        </Typography>
      </>
    ),
  },

  {
    id: "variants",
    label: "Variants",
    icon: TuneIcon,
    render: () => (
      <>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          A Variant is a parameterised version of the report — the same
          template, filtered or configured differently at run time.
        </Typography>
        <SubHeading>Create a variant</SubHeading>
        <StepList
          steps={[
            <>
              In the Left Panel, expand <UiLabel>Variants</UiLabel>, then
              click <UiLabel>Add Variant</UiLabel>.
            </>,
            <>
              Under <strong>Identity</strong>, fill in a unique{" "}
              <UiLabel>Variant Code</UiLabel> (no spaces), a{" "}
              <UiLabel>Variant Name</UiLabel>, and an optional description.
            </>,
          ]}
        />
        <SubHeading>Add parameters</SubHeading>
        <StepList
          steps={[
            <>
              Expand <strong>Parameters</strong> and click{" "}
              <UiLabel>Add Parameter</UiLabel>.
            </>,
            <>
              Set its name/label, type (STRING, DATE, NUMBER, BOOLEAN),
              whether it's required, whether it accepts multiple values, and
              the UI control end-users will see (text, date, number, select,
              multiselect, checkbox).
            </>,
          ]}
        />
        <SubHeading>Bind parameters to the database</SubHeading>
        <StepList
          steps={[
            <>
              Expand <strong>Filter Rules</strong> and click{" "}
              <UiLabel>Add Filter Rule</UiLabel>.
            </>,
            <>
              Choose a <strong>Scope</strong> (whole database, a specific
              table, or a dynamic row's table), pick the parameter, the
              database column it filters, and the operator.
            </>,
            <>
              Click <UiLabel>Add Variant</UiLabel> (or{" "}
              <UiLabel>Save Changes</UiLabel> when editing) to finish. The
              variant now appears in the Variants list with a count badge.
            </>,
          ]}
        />
      </>
    ),
  },

  {
    id: "toolbar",
    label: "Import, Export, Save & Search",
    icon: SaveIcon,
    render: () => (
      <>
        <SubHeading>Saving your work</SubHeading>
        <StepList
          steps={[
            <>
              Click <UiLabel>Save Template</UiLabel> in the top toolbar at
              any time to persist your changes.
            </>,
          ]}
        />
        <SubHeading>Import / Export</SubHeading>
        <StepList
          steps={[
            <>
              Click <UiLabel>Export Template</UiLabel> to download the
              current report definition as a file.
            </>,
            <>
              Click <UiLabel>Import</UiLabel> to load a previously exported
              template back into the builder.
            </>,
          ]}
        />
        <SubHeading>Searching the report</SubHeading>
        <StepList
          steps={[
            <>
              Use the search bar (
              <SearchOutlinedIcon
                sx={{ fontSize: 14, verticalAlign: "text-bottom" }}
              />
              ) in the top toolbar to find text across every cell.
            </>,
            <>
              Toggle <strong>match case</strong> or{" "}
              <strong>whole word</strong> to narrow results, then step through
              matches — the canvas scrolls to and highlights each one.
            </>,
          ]}
        />
        <SubHeading>Fullscreen</SubHeading>
        <StepList
          steps={[
            <>
              Click the fullscreen icon on the far right of the toolbar to
              expand the builder to fill your screen; click it again to exit.
            </>,
          ]}
        />
      </>
    ),
  },
];

/* ───────────────────────── main component ───────────────────────── */

export const HelpDialog = ({ open, onClose }) => {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(HELP_TOPICS[0].id);

  const filteredTopics = useMemo(() => {
    if (!query.trim()) return HELP_TOPICS;
    const q = query.trim().toLowerCase();
    return HELP_TOPICS.filter((t) => t.label.toLowerCase().includes(q));
  }, [query]);

  const activeTopic =
    HELP_TOPICS.find((t) => t.id === activeId) || HELP_TOPICS[0];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { height: "80vh", borderRadius: 2 } }}
    >
      {/* ── header ── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 3,
          py: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <HelpOutlineIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>
            Help & Documentation
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: 0, display: "flex", overflow: "hidden" }}>
        {/* ── topic sidebar ── */}
        <Box
          sx={{
            width: 260,
            flexShrink: 0,
            borderRight: "1px solid",
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            bgcolor: alpha(theme.palette.primary.main, 0.02),
          }}
        >
          <Box sx={{ p: 1.5 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search topics..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Box>
          <Divider />
          <List sx={{ overflowY: "auto", py: 0.5 }}>
            {filteredTopics.map((t) => {
              const Icon = t.icon;
              const selected = t.id === activeTopic.id;
              return (
                <ListItemButton
                  key={t.id}
                  selected={selected}
                  onClick={() => setActiveId(t.id)}
                  sx={{
                    mx: 1,
                    mb: 0.5,
                    borderRadius: 1.5,
                    "&.Mui-selected": {
                      bgcolor: alpha(theme.palette.primary.main, 0.12),
                      "&:hover": {
                        bgcolor: alpha(theme.palette.primary.main, 0.16),
                      },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 34 }}>
                    <Icon
                      fontSize="small"
                      color={selected ? "primary" : "action"}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primaryTypographyProps={{
                      variant: "body2",
                      fontWeight: selected ? 700 : 500,
                    }}
                  >
                    {t.label}
                  </ListItemText>
                </ListItemButton>
              );
            })}
            {filteredTopics.length === 0 && (
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ px: 2, display: "block", py: 2 }}
              >
                No topics match "{query}".
              </Typography>
            )}
          </List>
        </Box>

        {/* ── content ── */}
        <Box sx={{ flex: 1, overflowY: "auto", p: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <activeTopic.icon color="secondary" />
            <Typography variant="h6" fontWeight={700}>
              {activeTopic.label}
            </Typography>
            <Chip
              label={`${filteredTopics.length ? HELP_TOPICS.indexOf(activeTopic) + 1 : ""} / ${HELP_TOPICS.length}`}
              size="small"
              variant="outlined"
              sx={{ ml: "auto", fontSize: "0.65rem" }}
            />
          </Box>
          {activeTopic.render()}
        </Box>
      </DialogContent>
    </Dialog>
  );
};

HelpDialog.displayName = "HelpDialog";

/* ═══════════════════════════════════════════════════════════════════
   HOW TO WIRE THIS UP (small edit to TopToolbar.jsx)
   ═══════════════════════════════════════════════════════════════════

   1. Import at the top of TopToolbar.jsx:

        import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
        import { HelpDialog } from "./HelpDialog";   // adjust path
        import { useState } from "react";

   2. Inside the TopToolbar component, before the `return`:

        const [helpOpen, setHelpOpen] = useState(false);

   3. Add a button in the toolbar's action Box, e.g. right next to the
      fullscreen IconButton:

        <Tooltip title="Help & Documentation">
          <IconButton onClick={() => setHelpOpen(true)}>
            <HelpOutlineIcon />
          </IconButton>
        </Tooltip>

   4. Render the dialog once, right after the closing </Toolbar>:

        <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

   That's it — no Redux, no new dependencies, no changes anywhere else.
   ═══════════════════════════════════════════════════════════════════ */

