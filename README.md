# 2n

I wanted a terminal notes app that is directory based—notes per directory instead of file saving—that I can use next to agent sessions in any directory.

So I built 2n: write notes for any directory, fast and ergonomic for mediocre terminal users (like me). There’s also tree-based navigation to find any note across your system.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/plannotator/2n/main/install.sh | sh
```

## Use

```sh
2n        # Notes for this directory
2n --all  # All notes
```

Type and it saves. `Ctrl+N` creates a note, `Ctrl+T` opens all notes, `Ctrl+P` previews, and `Ctrl+C` exits.

[PolyForm Noncommercial 1.0.0](./LICENSE.md)
