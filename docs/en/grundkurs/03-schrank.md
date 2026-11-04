# Cabinet, addresses and names

In the control cabinet the **CPU** sits on a DIN rail, next to it **modules** with terminals:

- **DI** (digital inputs) – buttons and sensors arrive here
- **DO** (digital outputs) – lamps, motors and valves leave from here
- **AI/AO** – analogue inputs and outputs for numeric values

Each device gets a wire to exactly one terminal. In the game you first click the device at the
cabinet edge and then a free terminal.

<!-- Seite -->

## Addresses

Every terminal has an **address**. The program reaches the device via this address:

| Address | means                             |
| ------- | --------------------------------- |
| `%I0.0` | input, byte 0, bit 0              |
| `%I0.1` | input, byte 0, bit 1              |
| `%Q0.0` | output (Q), byte 0, bit 0         |
| `%IW64` | analogue input, one word (number) |

Eight bits make a byte: `%I0.0` to `%I0.7`, then it continues with `%I1.0`.

<!-- Seite -->

## Names instead of addresses

Nobody wants to remember that `%I0.3` is the emergency stop. So every address gets a **name** in the
**tag table** (PLC tags):

| Name       | Address | Data type |
| ---------- | ------- | --------- |
| `"Taster"` | `%I0.0` | Bool      |
| `"Lampe"`  | `%Q0.0` | Bool      |

In the program you then write `"Lampe"` instead of `%Q0.0`. In the game wiring creates these names
automatically – you find them in the program area under **PLC tags**.

> Rule of thumb: wire first, then program – the program uses the names from the table.
