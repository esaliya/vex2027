# vex2027

VEX IQ (2nd gen) robot code, written in VEXcode IQ.

## Projects

| File | What it is | Brain slot |
| --- | --- | --- |
| `lift_auto/lift_auto.iqcpp` | Lift robot autonomous (C++) | 7 |
| `lift_auto/lift_auto_comp.iqcpp` | Lift robot autonomous, competition copy (C++) | 7 |
| `lift_drive/current_lift.iqcpp` | Lift robot driver control (C++) | 1 |
| `lift_drive/original_lift.iqblocks` | Original lift driver control (Blocks) | 1 |
| `pneu_drive/current_pneu.iqblocks` | Pneumatic robot driver control (Blocks) | 0 |
| `pneu_drive/original_penumatric.iqblocks` | Original pneumatic driver control (Blocks) | 0 |

Projects that share a slot overwrite each other on the brain. Check the slot in
VEXcode before downloading.

## Rules for editing

A `.iqcpp` file is not plain C++: it is one line of JSON that holds the code
(in its `textContent` field) plus the robot's device setup.

- **Edit code in VEXcode IQ, or in VS Code with the viewer installed** (setup
  step 3). Never paste plain C++ into a `.iqcpp` file in any other editor
  (including GitHub's web editor): VEXcode then says the project file is
  corrupt.
- **Don't have a project open in VEXcode while editing it in VS Code.** Close
  it in VEXcode first and reopen it after saving in VS Code. Otherwise VEXcode
  can save its older copy over your changes.
- **Change devices and ports in VEXcode only.** VEXcode rewrites the
  `VEXcode Generated Robot Configuration` section at the top of the code from
  its device setup, so edits there are lost.
- **Close the project in VEXcode before `git pull` or switching branches**, and
  reopen it afterwards, for the same reason.

## One-time setup (each computer)

### 1. Install jq

`jq` reads the code out of the JSON.

- macOS: `brew install jq` (many Macs already have it at `/usr/bin/jq`)
- Windows: `winget install jqlang.jq`

### 2. Make git show code changes in `.iqcpp` files

Run this once in your clone of the repo:

```bash
git config diff.iqcpp.textconv 'sh -c '\''out=$(jq -r .textContent "$0" 2>/dev/null) && printf "%s\n" "$out" || cat "$0"'\'''
```

`.gitattributes` (already in the repo) marks `.iqcpp` files; this command tells
your git how to read them. Without it, `git diff` shows each `.iqcpp` file as
one long changed line. Older commits stored some files as plain C++, and the
command shows those as they are.

### 3. Install the VS Code viewer (needed to read or edit code in VS Code)

```bash
tools/vscode-iqcpp-viewer/install.sh
```

This needs `bash`, `jq`, `zip` and VS Code. Then run **Developer: Reload
Window** in every open VS Code window; until you do, VS Code keeps running the
version it already had. Run the script (and reload) again whenever
`tools/vscode-iqcpp-viewer` changes.

## Editing code and seeing changes

- **VS Code:** opening a `.iqcpp` file shows its code as C++. Edit it and save
  as usual; saving puts the code back into the `.iqcpp` file and leaves the
  device setup, slot and version info as they were. The `{}` button in the
  tab's title bar shows the raw JSON (don't edit that). To turn the viewer off,
  set `iqcppViewer.openAsCode` to `false` in VS Code settings.
- **VS Code Source Control:** clicking a changed `.iqcpp` file shows a C++ diff.
  The compare button in the code view's title bar opens the same diff. You can
  edit the right-hand (current) side; the left-hand side is the older version
  from git and is read-only.
- **Terminal:** `git diff` and `git log -p` show C++ changes. `git diff --stat`
  still counts each `.iqcpp` file as one line.

## Running `lift_auto_comp` on the robot

The TouchLED shows what the robot is doing, and a press does the next step:

| LED | Meaning | Press |
| --- | --- | --- |
| Blue | Calibrating the inertial sensor (about 2 s); keep the robot still | Ignored |
| Green | Ready | Starts the run |
| Orange | Running | Stops the run |
| Red | Finished or stopped; the screen shows the time report | Recalibrates (blue, then green) |

- The program calibrates when it starts, so wait for green before the first run.
- Presses within 0.5 s of an LED change are ignored, so a double tap can't
  start or stop a run by accident.
- The joystick drives the robot when the LED is green or red, but not while it
  is blue or orange.
