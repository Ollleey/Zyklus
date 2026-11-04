# What is a PLC?

A **PLC** (programmable logic controller) is a small industrial computer in the control cabinet. It
controls machines: conveyor belts, pumps, traffic lights, gates, presses.

Instead of hard-wiring cables and relays, you write a **program**. To change the behaviour, you
change the program – not the wiring.

| Part        | Job                                    | Example                        |
| ----------- | -------------------------------------- | ------------------------------ |
| **Inputs**  | tell the PLC what is happening outside | button, switch, sensor         |
| **Program** | decides what should happen             | “lamp on while button pressed” |
| **Outputs** | switch devices on and off              | lamp, motor, valve             |

<!-- Seite -->

## How a PLC works

The PLC works in a loop, the **cycle**. Again and again, many times per second:

1. **Read inputs** – who is pressing right now? Which sensor reports something?
2. **Run the program** – from top to bottom, line by line
3. **Write outputs** – lamps, motors and valves get their new state

Then everything starts again. In the game a cycle takes 10 ms – so the PLC checks a hundred times per
second whether something has changed.

> Rule of thumb: the PLC keeps asking “what is outside?”, calculates briefly and then switches.

<!-- Seite -->

## In the game

In ZYKLUS you build exactly such a controller:

- In the **control cabinet** you put a **CPU** (that is the PLC) and input/output modules on a DIN
  rail and wire up the devices of the plant.
- In the **program** you write what the plant should do – in **SCL** (text) or **FBD/LAD** (blocks
  you click together).
- In the **test bench** you try it out; **Verify** accepts the work.

Don't worry: you don't need to know any of this yet. The next lessons explain everything step by
step.
