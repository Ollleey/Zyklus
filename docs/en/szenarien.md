# Scenarios – test runs with a timeline

The sandbox has a **“Scenarios”** tab. A scenario is a test run for your own plant: what happens
when, and which rules must hold anyway?

## Sequence

Every event has a time in seconds. Events at **0 s** set the initial state.

| Event           | Effect                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------- |
| Operate         | button, switch, emergency stop, selector (0/manual/auto) or potentiometer (0…100)         |
| Fault           | sensor always 0/1, wire break, cylinder jammed, belt blocked – to the end or until a time |
| Power failure   | the controller has no supply until a time and then restarts (OB100)                       |
| Insert part     | a workpiece (material, colour, size) drops onto a part from above                         |
| Magazine issues | a magazine issues a part immediately                                                      |
| Set level       | a tank suddenly has the given level (leak, refill)                                        |

The **“+”** field after the time is a **random offset**: per seed the event comes up to that many
seconds later. So a fault does not always hit the same point of the cycle. With several seeds the
scenario runs several times with different random values. A fault with an end is shifted as a whole.

The **timeline** shows all events: marks for points in time, bars for the duration of faults and
power failures, light areas for the random range. While playing, a line moves along.

## Rules

The same rules as for publishing, plus two for sequences with faults:

- **off from time**: an output is off from a time to the end (e.g. belt after emergency stop)
- **on during period**: an output is on continuously during a period (e.g. fault lamp)

With random offsets, leave enough margin in the rule times.

## Play, verify, share

- **▶ Play** selects the scenario in the simulation bar and starts it: you see plant, signals and
  program live. In the simulation bar you can also switch directly between “Free run” and the
  scenarios.
- **✓ Verify** runs the scenario for each seed with your program and shows every rule with ✓ or ✗.
- Scenarios are saved with the plant (also in the `.anlage` file). **Export** writes a single
  scenario as a `.szenario` file; **Import** adds it to a plant with the same tags. References to
  missing parts are shown in red.
- **Publish as job** takes all scenarios as test cases. The job's datasheet lists the sequence of
  each test case.
