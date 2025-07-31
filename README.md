# Punch Git

Git remote helper P2P remote - no server, just peers

## Development

Quick setup for testing, link the file to a folder on your path so you can use with git:
```bash
sudo ln -s $(pwd)/index.js /usr/local/bin/git-remote-punch
```

Git will automatically look for `git-remote-<protocol>` when accessing a remote.

Add a test remote with:

```bash
git remote add punch punch://<any value> 
```

The `<any-value>` will be replaced with a public key for your repo soon.