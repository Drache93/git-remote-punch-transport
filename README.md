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

## Development

Quick setup for testing, link the file to a folder on your path so you can use with git:
```bash
sudo ln -s $(pwd)/index.js /usr/local/bin/git-remote-punch
```

Git will automatically look for `git-remote-<protocol>` when accessing a remote.

## ToDo
- [ ] Mult-writer
- [ ] Access management
- [ ] Deduplication
- [ ] In memory git packing

## Note

This is an early development release and is not yet optimized for efficiency. 