# Logic: AND, OR, NOT

The simplest program copies an input to an output. In **SCL** (the text language) the left side is
what gets switched, the right side what it depends on:

```
"Lampe" := "Taster";
```

`:=` means “becomes”. The semicolon `;` ends the statement. As long as the button is 1, the lamp is
1 too.

<!-- Seite -->

## AND, OR, NOT

| Operation | SCL           | is 1 when …       |
| --------- | ------------- | ----------------- |
| AND       | `"A" AND "B"` | both are 1        |
| OR        | `"A" OR "B"`  | at least one is 1 |
| NOT       | `NOT "A"`     | A is currently 0  |

Examples:

```
// press only when both hands are on the buttons
"Presse" := "Taster_links" AND "Taster_rechts";

// hallway light: from two places
"Licht" := "Taster_oben" OR "Taster_unten";

// warning lamp while the gate is NOT closed
"Warnung" := NOT "Tor_zu";
```

<!-- Seite -->

## Truth table

This is how you check an operation: write down all cases.

| A   | B   | A AND B | A OR B |
| --- | --- | ------- | ------ |
| 0   | 0   | 0       | 0      |
| 0   | 1   | 0       | 1      |
| 1   | 0   | 0       | 1      |
| 1   | 1   | 1       | 1      |

Brackets set the order, as in maths:
`"Motor" := ("Start" OR "Hand") AND NOT "Stoerung";`

## The same graphically

In **FBD** these are boxes: `&` for AND, `>=1` for OR, a small circle at the input for NOT. In
**LAD** they are contacts in series (AND) or in parallel (OR). In the game you can switch between
SCL, FBD and LAD at any time – use whatever feels easier.
