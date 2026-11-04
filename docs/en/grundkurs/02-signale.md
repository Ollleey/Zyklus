# Signals: 0 and 1

Most signals of a controller only know two states:

| Value | also called | Example                                |
| ----- | ----------- | -------------------------------------- |
| **1** | TRUE, on    | button pressed, sensor detects a part  |
| **0** | FALSE, off  | button released, nothing at the sensor |

Such a signal is called **binary** or **digital**, its data type is **Bool**. In the game's timing
chart you see it as a line jumping between bottom (0) and top (1).

<!-- Seite -->

## Sensors – the senses of the plant

**Sensors** report something to the PLC. They are connected to **inputs**.

- **Push button**: 1 while pressed. Released, it is 0 again.
- **Switch**: stays in the position you put it in.
- **Light barrier**: 1 when an object interrupts the light beam.
- **Inductive sensor**: detects metal nearby.
- **Limit switch**: reports that something has reached a position (e.g. gate open).

Some sensors deliver a **number** instead of 0/1, e.g. a level. That is called **analogue**; we will
come to it later.

<!-- Seite -->

## Actuators – the muscles of the plant

**Actuators** do something. They are connected to **outputs**.

- **Lamp**: lit at 1.
- **Motor**: runs at 1 (e.g. a conveyor belt).
- **Valve**: opens at 1 – air extends a cylinder, water flows.

## Normally open and normally closed

A **normally open** contact (NO) delivers 1 when actuated. A **normally closed** contact (NC) is the
opposite: it delivers 1 when **not** actuated. Why so complicated? With a broken cable only 0
arrives. With an emergency stop as NC contact, a broken cable therefore means the same as
“emergency stop pressed” – the plant stays safely stopped.

> Rule of thumb: emergency stop and stop buttons are NC. 1 means “all is well”.
