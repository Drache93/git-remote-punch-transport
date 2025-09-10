# Punch Git

Git remote helper P2P remote - no server, just peers

## Installation

Install the git remote helper globally:

```bash
npm i -g https://github.com/Drache93/git-remote-punch-transport
```

This installs `git-remote-punch` which git will automatically use when accessing punch:// remotes.

## Usage

### Running the UI

Start the user interface with:

```bash
pear run pear://cgnph3qsrfk55pcpzyd3ab7rheqd9jjcxfam3ypmu9989q1xk3zy
```

### Adding a Remote

Add a test remote with:

```bash
git remote add punch punch://<any value>
```

The `<any-value>` will be replaced with a public key for your repo soon.

### Progress Output

The transport provides git-like progress output during push and fetch operations, showing:

- **Enumerating objects**: Counts objects being prepared for transfer
- **Writing objects**: Shows percentage complete, object count, data size, and transfer rate
- **Receiving objects**: Similar progress for fetch/clone operations

Example push output:
```
Punching... Punched! Found 2 peers
⠙ Enumerating objects: 42
✔ Enumerating objects: 42, done.
⠙ Writing objects: 75% (32/42) [===============     ] 1.2 MiB
✔ Writing objects: 100% (42/42), 1.6 MiB | 245.3 KiB/s, done.
```

Progress output is enabled by default and uses `yocto-spinner` for smooth visual feedback. All progress messages are written to `process.stderr` to avoid interfering with the git protocol communication on stdout.

## Development

Quick setup for testing, link the file to a folder on your path so you can use with git:
```bash
sudo ln -s $(pwd)/index.js /usr/local/bin/git-remote-punch
```

Git will automatically look for `git-remote-<protocol>` when accessing a remote.

## ToDo
- [ ] Ensure natural object ordering is replicated in core
- [ ] Mult-writer
- [ ] Access management
- [x] Deduplication - Objects are not pushed if they already exist on the remote
- [x] In memory git packing - uses `isomorphic-git` to rebuild the repo from the stored objects

## Note

This is an early development release and is not yet optimized for efficiency.
