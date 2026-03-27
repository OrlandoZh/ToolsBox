# Clean-Room Risk Checklist

This is not legal advice. Use counsel for final release review.

## Source Isolation
- [ ] New implementation does not import from AGPL project source paths.
- [ ] No direct copy of AGPL code, comments, or unique naming patterns.
- [ ] New module boundaries and architecture are independently designed.

## Process Evidence
- [ ] Behavior requirements documented in `SPEC.md` before implementation.
- [ ] Commits show feature-by-feature incremental rewrite.
- [ ] Design notes explain key decisions in your own words.

## Similarity Control
- [ ] Manual spot-check for suspiciously identical blocks.
- [ ] Optional automated similarity scan executed (`scripts/similarity-check.sh`).
- [ ] Rewritten areas with high similarity are revised.

## Release Gate
- [ ] Third-party dependencies have compatible licenses.
- [ ] Distribution package includes proper notices for included dependencies.
- [ ] Final legal review completed before shipping.
