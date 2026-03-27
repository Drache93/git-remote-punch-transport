# Gip Transport

Git remote helper for P2P remotes — no server, just peers.

Uses [gip-remote](https://github.com/holepunchto/gip-remote) for the underlying Git-in-Pear database.

## Installation

Install the git remote helper globally:

```bash
npm i -g git-remote-gip
```

This installs `git-remote-gip` which git will automatically use when accessing `git+pear://` remotes.

## Usage

### Creating a Repository

```bash
gip new my-repo
```

### Adding a Remote

```bash
git remote add origin git+pear://<key>/my-repo
```

### Push & Fetch

Works like any git remote:

```bash
git push origin main
git fetch origin
git clone git+pear://<key>/my-repo
```

### Progress Output

The transport provides git-like progress output during push and fetch operations:

- **Enumerating objects**: Counts objects being prepared for transfer
- **Writing objects**: Shows percentage complete, object count, data size, and transfer rate
- **Receiving objects**: Similar progress for fetch/clone operations

Example push output:

```
Connecting... Connected! Found 2 peers
✔ Enumerating objects: 42, done.
✔ Writing objects: 100% (42/42), 1.6 MiB | 245.3 KiB/s, done.
```

Progress is written to stderr to avoid interfering with git protocol communication on stdout.

## Development

Link the remote helper so git can find it:

```bash
sudo ln -s $(pwd)/remote.js /usr/local/bin/git-remote-gip
```

Git automatically looks for `git-remote-<protocol>` when accessing a remote.

## ToDo

- [ ] Multi-writer
- [ ] Access management
- [x] Deduplication — objects are not pushed if they already exist on the remote
- [x] In-memory git packing via rebuild-git
