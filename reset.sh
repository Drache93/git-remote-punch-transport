#!/bin/sh

rm -rf ~/.punch
remote=$(./bin-tui.js new git-remote | tr ' ' '\n' | tail -1)
echo $remote

git remote remove punch || echo 'OK'
git remote add punch $remote
