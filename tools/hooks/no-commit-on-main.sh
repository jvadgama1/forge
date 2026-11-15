# The pre-commit hook's first step (#152): refuse a commit on main. Branch
# protection only stops a push, so without this a commit can land on a local
# main unnoticed, and a branch made from it carries the commit along. No
# branch (a detached HEAD) passes; merges happen on GitHub.
if [ "$(git branch --show-current)" = main ]; then
  echo "main is protected: commit on an issue branch (<n>-<slug>)" >&2
  exit 1
fi
