# 2n

Directory-based notes for the terminal.

`2n` associates notes with the current working directory, making it useful alongside development and agent sessions without creating note files inside the project. Notes save automatically, and a global tree provides access to notes from every directory.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/plannotator/2n/main/scripts/install.sh | sh
```

Standalone binaries are available for macOS, Linux, and Windows on the [releases page](https://github.com/plannotator/2n/releases).

## Demo

https://github.com/user-attachments/assets/3449b3d7-e83a-451d-8d1a-1a51b80e3205

## Usage

```sh
2n                            # Open the latest note for this directory
2n --all                      # Browse notes from every directory
2n --no-animation             # Skip the launch animation once
2n config animation on|off    # Set the launch animation preference
```

## Controls

| Key | Action |
| --- | --- |
| `Ctrl+N` | Create a note |
| `Ctrl+T` | Open all notes |
| `Ctrl+P` | Preview Markdown |
| `Ctrl+C` | Save and exit |

Typing starts immediately. Changes are saved automatically.

## Storage

Notes are stored in the operating system’s application-data directory, not in the current project. Set `TUINOTES_DATA_HOME` to use a custom location.

## License

[PolyForm Noncommercial 1.0.0](./LICENSE.md). Commercial use requires separate permission from Plannotator.
