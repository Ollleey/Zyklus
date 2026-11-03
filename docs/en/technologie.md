# Technology

Technology blocks are ready-made, **protected** FBs: you see their interface, not their code. In FBD
and LAD they are listed under **Technology**, in SCL you call them via an instance DB. They don't
count toward program size but cost computing time like your own code.

The **configuration** is stored in the instance DB (Data blocks tab, expand the DB): start values of
the parameters. Empty fields use the default. In the SCL source the start values are in the
statement section of the DB (`Gain := 2.5;`).

## PID_Compact

PID controller with manual and automatic mode and self-tuning.

```
"Ofen_PID"(Setpoint := "Sollwert", Input := "Temperatur",
           Tune := "Optimieren", Output => "Heizung");
```

| Input        | Meaning                                           |
| ------------ | ------------------------------------------------- |
| Setpoint     | setpoint                                          |
| Input        | actual value (same unit as the setpoint)          |
| ManualEnable | manual mode: Output = ManualValue                 |
| ManualValue  | output value in manual mode in %                  |
| Reset        | controller inactive, Output = 0, integral cleared |
| Tune         | a rising edge starts self-tuning                  |

| Output     | Meaning                                                          |
| ---------- | ---------------------------------------------------------------- |
| Output     | output value in % (OutputLow … OutputHigh)                       |
| Output_PWM | output value as a pulse width for a switching output (PwmPeriod) |
| State      | 0 inactive, 2 self-tuning, 3 automatic, 4 manual                 |
| Error      | self-tuning aborted (timeout) or limits invalid                  |

| Parameter   | Default | Meaning                                                 |
| ----------- | ------- | ------------------------------------------------------- |
| Gain        | 1.0     | proportional gain                                       |
| Ti          | 20.0    | integral time in s (0 = no integral part)               |
| Td          | 0.0     | derivative time in s (acts on the actual value)         |
| OutputLow   | 0.0     | lower output limit in %                                 |
| OutputHigh  | 100.0   | upper output limit in %                                 |
| PwmPeriod   | 2.0     | period of Output_PWM in s                               |
| TuneHyst    | 1.0     | switching hysteresis of self-tuning (actual value unit) |
| TuneTimeout | 3600.0  | self-tuning aborts after s                              |

**Control law:** Output = Gain · (e + 1/Ti · ∫e dt) − Gain · Td · dInput/dt with e = Setpoint −
Input. The integral part only integrates while the output is not saturated in the direction of the
error (no windup). The block measures the time between two calls itself – it may run in OB1 or in a
cyclic interrupt OB.

**Self-tuning:** the controller switches the output between OutputHigh and OutputLow as soon as the
actual value crosses the setpoint ± TuneHyst. After one settling period it measures two full
oscillations: period Tu and amplitude a give the critical gain Ku = 4 · d / (π · a) with d = half
the output range. From that: **Gain = 0.35 · Ku**, **Ti = 1.2 · Tu**, Td = 0. Then it continues in
automatic mode. The determined values are in the instance DB (`"Ofen_PID".Gain`) – take them over as
start values so they apply after loading.

Tips: choose TuneHyst somewhat larger than the noise of the actual value. For slow processes tuning
takes several minutes of plant time – run it on the test bench at ×10 or ×100.

## High-speed counter (HSC)

On the **DI 8 HF**, channel 0 can be set up as a high-speed counter (click the module in the
cabinet, “Channel 0 as high-speed counter”). The module then counts every rising edge on a 1 ms
grid – independently of the cycle and the input delay.

| Address (default) | Content                                         |
| ----------------- | ----------------------------------------------- |
| `%ID112`          | count value (DInt), overflows at 2³¹            |
| `%Q112.0`         | 1 = set the counter to 0 (while the bit is set) |

The byte address is configurable (0…124). The channel additionally stays a normal input (`%I…0`
with input delay), a hardware interrupt is still possible.

```
%Q112.0 := "Start" AND NOT "Start_alt";   // reset with the start edge
"Start_alt" := "Start";
"Ventil" := %ID112 < 120;
```

## PWM and PTO (DQ 4 HF)

Every channel of the **DQ 4 HF** is a normal output or a fast output whose signal the module
generates itself. The program only writes a **control word** per channel (default from `%QW120`,
channel n at `%QW120 + 2·n`, start address configurable):

- **PWM:** fixed period (ms, in the cabinet), duty cycle from the control word in per mille
  (0…1000). `%QW120 := 250;` → 25 % on.
- **PTO:** pulse train with the frequency from the control word in Hz (0…500), duty cycle 50 %.

On CPU STOP fast outputs are off. The channel's process image bit has no effect.

## Communication between CPUs (TSEND_C / TRCV_C)

CPUs in the same plant are connected via Ethernet – without a coupler module. A **connection** has an
ID that both sides use. With exactly two CPUs, ID 1 exists automatically; further connections are
created in the cabinet at the CPU.

```
"Senden"(REQ := "Neu", ID := 1, DATA := "Daten".Rezept);        // instance DB of type TSEND_C
"Empfang"(EN_R := TRUE, ID := 1, DATA := "Daten".Rezept);      // instance DB of type TRCV_C
```

- **DATA** is a variable: elementary, array or structure (UDT); strings are not transferred. Sender
  and receiver need the same number of elements with the same data types.
- **TSEND_C:** a rising edge at REQ takes the current content of DATA along. BUSY is set until the
  message has arrived (5 ms plus 1 ms per 8 elements, longer if the receiver hasn't fetched the
  previous message yet), then DONE is 1 for one call.
- **TRCV_C:** while EN_R = 1, the call writes an arrived message to DATA; NDR is then 1 for one
  call. At most one message waits per connection.

| STATUS  | Meaning                                          |
| ------- | ------------------------------------------------ |
| 16#7000 | ready                                            |
| 16#7001 | sending (BUSY)                                   |
| 16#7002 | receive ready, no message yet                    |
| 16#0000 | done (DONE or NDR)                               |
| 16#80A3 | no connection with this ID (ERROR)               |
| 16#80B3 | length or data types of DATA don't match (ERROR) |
| 16#80C4 | partner not reachable for 1 s (ERROR)            |

If the partner is switched off or never fetches a message, the job aborts after **1 s** with ERROR
and STATUS 16#80C4 (also for PUT/GET). In FBD and LAD both boxes are under “Communication”. After a
CPU restart open jobs are discarded.

### PUT and GET

Instead of exchanging messages, a CPU can also write directly into **memory bits of the partner
CPU** or read from them – via the same connections (ID):

```
"Schreiben"(REQ := "Neu", ID := 1, ADDR_1 := %MW100, SD_1 := "Daten".Sollwert);  // instance DB PUT
"Lesen"(REQ := "Takt", ID := 1, ADDR_1 := %MW102, RD_1 := "Daten".Istwert);     // instance DB GET
```

- **ADDR_1** is a memory address of the **partner CPU** (bit, byte, word or double word), SD_1 or
  RD_1 an elementary variable of the same size.
- A rising edge at REQ starts the job; after the transfer time DONE (PUT) or NDR (GET) is 1 for one
  call, with GET the read value is then in RD_1.
- The partner CPU doesn't need to program anything; writing and reading also works in STOP, only
  not without power.
- STATUS and ERROR as with TSEND_C (16#80A3: no connection).

## Operator panel and alarms

Some jobs have an **operator panel** instead of fixed buttons. Its elements are not wired: each is
connected to a memory bit of the CPU and appears in the PLC tag table like a device.

| Element        | Kind | Address (automatic) | Behaviour                                  |
| -------------- | ---- | ------------------- | ------------------------------------------ |
| Button, switch | DI   | from `%M200.0`      | writes the memory bit on every operation   |
| Lamp           | DO   | from `%M200.0`      | reads the memory bit every refresh (50 ms) |
| Input field    | AI   | from `%MW220`       | writes the entered value (Int)             |
| Display        | AO   | from `%MW220`       | reads the word every refresh               |

Bits and words are assigned in the order of the elements; via **⚙ Addresses** on the panel each
element can get its own memory address (empty = automatic), the tag table follows. Because the panel
only writes on an operation, the program may also reset a button memory bit itself.

**Alarms** come from the program with **Program_Alarm** (instance DB of type Program_Alarm):

```
"Ofen_heiss"(SIG := "Temperatur" > 180.0, TEXT := 'Ofen über 180 °C');
```

Every edge at SIG reports the alarm as coming or going with a time stamp. The panel shows the latest
alarms, active ones in red. A coming alarm is **unacknowledged** (flashes with “!”) until
**Acknowledge** is pressed on the panel; the program sees this in `"Ofen_heiss".Ack_State` (FALSE =
unacknowledged). After a CPU restart no alarms are active any more.

## NORM_X and SCALE_X

Scaling as a box pair (FBD/LAD under Move, in SCL as functions):
`NORM_X(MIN := 0, VALUE := "Rohwert", MAX := 27648)` gives 0.0 … 1.0,
`SCALE_X(MIN := 0.0, VALUE := #norm, MAX := 200.0)` maps to the measuring range.
