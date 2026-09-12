# `business/daily/` — the assembled company report

One file per day: `YYYY-MM-DD.md`. Each stitches together five executive
sections — engineering (`cto`), product (`cpo`), marketing (`cmo`), design
(`vp-design`) and research (`vp-research`) — plus a debates section only the
assembler writes.

`cfo` and `vp-support` are deliberately out until there is something to report:
finance joins when the first real order lands, support when the first customer
message arrives. The `daily-report` skill says how to add them.

**This is the one directory in `business/` with no single owner.** Everywhere
else the rule is one owner per directory; here the assembler writes and the
five contributors feed it. That exception is why they contribute *through*
their own `business/<domain>/daily/YYYY-MM-DD.md` section files rather than
writing here directly — several agents editing one file concurrently silently
lose sections.

The section files are not scratch. Keep them: when the assembled report says
something surprising, the section file is where you find out which executive
said it and what they cited.

Run it with the `daily-report` skill. Goals live in each domain's `goals.md`,
never here — a report measures against goals written down beforehand, which is
the entire point of separating the two files.
