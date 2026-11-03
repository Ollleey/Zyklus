/**
 * Englische Fassung der Meldungen aus Compiler, Schaltschrankprüfung und CPU. Die Pakete melden
 * auf Deutsch; die Oberfläche übersetzt beim Anzeigen. `{}` steht für einen eingesetzten Teil,
 * im Englischen der Reihe nach `$1`, `$2`, …
 */
const TABLE: [string, string][] = [
  // FUP / KOP / GRAPH
  ['Operand am Kontakt fehlt', 'Operand missing at the contact'],
  ['Operand fehlt', 'Operand missing'],
  ['Operand am Flankenkontakt fehlt', 'Operand missing at the edge contact'],
  ['Die Kette braucht genau einen Initialschritt', 'The sequence needs exactly one initial step'],
  ['Schrittnummer {} ist ungültig', 'Step number $1 is invalid'],
  ['Schrittnummer {} ist doppelt', 'Step number $1 is used twice'],
  [
    'Transition führt zu Schritt {}, den es nicht gibt',
    'Transition leads to step $1, which does not exist',
  ],
  ['Transition ohne Bedingung', 'Transition without condition'],
  ['Bedingung „{}“: {}', 'Condition “$1”: $2'],
  ['Aktion ohne Operand', 'Action without operand'],
  ['Operand „{}“ ist keine Variable', 'Operand “$1” is not a variable'],
  ['Aktion D braucht eine Zeit, z. B. T#2s', 'Action D needs a time, e.g. T#2s'],
  [
    '{} wird mit S/R gespeichert und kann nicht N/D sein',
    '$1 is stored with S/R and cannot be N/D',
  ],
  ['{} ist schon N/D und kann nicht S/R sein', '$1 is already N/D and cannot be S/R'],
  [
    'Schrittketten gibt es nur in Funktionsbausteinen (FB)',
    'Sequences only exist in function blocks (FB)',
  ],
  ['Verbindung zu einer gelöschten Box', 'Connection to a deleted box'],
  ['{} gibt es in KOP nicht als Element', '$1 does not exist as an element in LAD'],
  [
    'Strompfad läuft nicht über den ersten Ausgang',
    'The rung does not run through the first output',
  ],
  ['Netzwerk endet nicht mit einer Zuweisung', 'The network does not end with an assignment'],
  [
    'Zuweisungen hängen an verschiedenen Verknüpfungen',
    'Assignments hang on different logic operations',
  ],
  ['Box {} hängt an keiner Zuweisung', 'Box $1 is not connected to any assignment'],
  [
    'Nur Bool-Signale lassen sich verbinden – Werte laufen über Operanden',
    'Only Bool signals can be connected – values go through operands',
  ],
  [
    'Ausgang ist auf einen Eingang derselben Box zurückgeführt',
    'Output is fed back to an input of the same box',
  ],
  ['Rückkopplung: Verbindungen bilden einen Kreis', 'Feedback: connections form a loop'],
  ['Operand „{}“ an {}: {}', 'Operand “$1” at $2: $3'],
  [
    'An {} ist nur ein Operand oder eine Konstante erlaubt, kein Ausdruck',
    'Only an operand or a constant is allowed at $1, not an expression',
  ],
  ['Eingang {} hat mehrere Verbindungen', 'Input $1 has several connections'],
  [
    'Eingang {} ist verbunden und hat zusätzlich einen Operanden',
    'Input $1 is connected and also has an operand',
  ],
  [
    'BOOL erwartet: nur 0, 1, TRUE oder FALSE erlaubt.',
    'BOOL expected: only 0, 1, TRUE or FALSE allowed.',
  ],
  ['Eingang {} ist offen', 'Input $1 is open'],
  ['Eingang {} braucht einen Operanden', 'Input $1 needs an operand'],
  [
    'Ausgang ist nicht verbunden – die Verknüpfung hat keine Wirkung',
    'Output is not connected – the logic operation has no effect',
  ],
  [
    'Ausgang ist nicht verbunden – der Vergleich hat keine Wirkung',
    'Output is not connected – the comparison has no effect',
  ],
  ['Baustein „{}“ ist nicht vorhanden', 'Block “$1” does not exist'],
  ['{} über der Box fehlt', '$1 above the box is missing'],
  // Hardware und Speichergrenzen
  ['{} kennt keine Weckalarme (OB „{}“)', '$1 has no cyclic interrupts (OB “$2”)'],
  ['{} kennt keine Prozessalarme (OB „{}“)', '$1 has no hardware interrupts (OB “$2”)'],
  [
    'Prozessalarm „{}“: {} liegt nicht auf einem alarmfähigen Eingang (DI 8 HF) dieser CPU',
    'Hardware interrupt “$1”: $2 is not on an interrupt-capable input (DI 8 HF) of this CPU',
  ],
  ['Programm zu groß für {}: {} von {} Netzwerken', 'Program too large for $1: $2 of $3 networks'],
  [
    'Programm zu groß für {}: {} von {} Anweisungen',
    'Program too large for $1: $2 of $3 statements',
  ],
  [
    'Arbeitsspeicher zu klein für {}: Daten {} von {} Byte',
    'Work memory too small for $1: data $2 of $3 bytes',
  ],
  // Projekt, Bausteine, Datentypen
  ['Startwert von {}: {}', 'Start value of $1: $2'],
  ['FUP-Bausteine werden noch nicht übersetzt', 'FBD blocks are not compiled yet'],
  ['Bausteinname „{}“ ist doppelt vergeben', 'Block name “$1” is used twice'],
  ['„{}“ ist sowohl PLC-Variable als auch Baustein', '“$1” is both a PLC tag and a block'],
  ['Kein Organisationsbaustein „Main“ (OB1) vorhanden', 'No organization block “Main” (OB1)'],
  ['Baustein „{}“ wird nirgends aufgerufen', 'Block “$1” is never called'],
  ['PLC-Variablen „{}“ und „{}“ überlappen sich', 'PLC tags “$1” and “$2” overlap'],
  ['Startwert ist länger als {} Zeichen', 'Start value is longer than $1 characters'],
  [
    'Remanent sind nur Variablen in Global-DBs und Input/Output/Static eines FB',
    'Only variables in global DBs and Input/Output/Static of an FB can be retentive',
  ],
  ['{} ist im Datenbaustein doppelt vorhanden', '$1 exists twice in the data block'],
  [
    'Zeiten und Zähler starten hier bei jedem Neustart neu (nicht remanent)',
    'Timers and counters restart here on every restart (not retentive)',
  ],
  [
    '„{}“ ist eine Funktion (FC) und hat keinen Instanz-DB',
    '“$1” is a function (FC) and has no instance DB',
  ],
  ['Instanz-DB „{}“: {} hat kein Element {}', 'Instance DB “$1”: $2 has no element $3'],
  [
    'Instanz-DB „{}“: Startwert von {} („{}“) ist ungültig',
    'Instance DB “$1”: start value of $2 (“$3”) is invalid',
  ],
  [
    'Instanz-DB „{}“: unbekannter Typ „{}“ (erwartet ein eigener FB oder z. B. IEC_TIMER, IEC_COUNTER, TON_TIME, R_TRIG)',
    'Instance DB “$1”: unknown type “$2” (expected an own FB or e.g. IEC_TIMER, IEC_COUNTER, TON_TIME, R_TRIG)',
  ],
  ['PLC-Datentyp „{}“ hat keine Elemente', 'PLC data type “$1” has no elements'],
  ['Element {} ist im Datentyp doppelt vorhanden', 'Element $1 exists twice in the data type'],
  [
    'Instanzen ({}) gehören nicht in einen PLC-Datentyp',
    'Instances ($1) do not belong in a PLC data type',
  ],
  ['PLC-Datentyp „{}“ enthält sich selbst', 'PLC data type “$1” contains itself'],
  ['PLC-Datentyp „{}“ ist fehlerhaft', 'PLC data type “$1” is faulty'],
  ['Datentyp „{}“: {}', 'Data type “$1”: $2'],
  ['Länge einer Zeichenkette: 1 … 254 (String[20])', 'Length of a string: 1 … 254 (String[20])'],
  [
    'Instanzen ({}) können nicht Element eines Feldes oder einer Struktur sein',
    'Instances ($1) cannot be an element of an array or a structure',
  ],
  ['Unbekannter Datentyp „{}“', 'Unknown data type “$1”'],
  [
    'Feldgrenzen {}..{}: Untergrenze größer als Obergrenze',
    'Array bounds $1..$2: lower bound greater than upper bound',
  ],
  ['Feld ist zu groß (höchstens {} Elemente)', 'Array is too large (at most $1 elements)'],
  ['Element {} ist in der Struktur doppelt vorhanden', 'Element $1 exists twice in the structure'],
  [
    'Startwertlisten gibt es nur für Felder mit elementarem Typ',
    'Start value lists only exist for arrays of elementary type',
  ],
  [
    'Startwert eines Feldes ist eine Liste, z. B. {}',
    'The start value of an array is a list, e.g. $1',
  ],
  ['Wiederholung braucht mindestens 1', 'A repetition needs at least 1'],
  ['Zu viele Startwerte: {} für {} Elemente', 'Too many start values: $1 for $2 elements'],
  [
    'Typkonflikt: {} passt nicht zu {} – nur gleiche Typen lassen sich als Ganzes zuweisen',
    'Type conflict: $1 does not match $2 – only equal types can be assigned as a whole',
  ],
  ['DATA von {} ist nicht beschreibbar', 'DATA of $1 is not writable'],
  ['DATA von {}: String wird nicht übertragen', 'DATA of $1: strings are not transferred'],
  [
    'DATA von {} muss eine Variable sein (elementar, Feld oder Struktur)',
    'DATA of $1 must be a variable (elementary, array or structure)',
  ],
  [
    '{} ist vom Typ {} – zuweisen lässt sich nur eine ganze Variable gleichen Typs',
    '$1 is of type $2 – only a whole variable of the same type can be assigned',
  ],
  ['{} ist kein Feld (Typ {})', '$1 is not an array (type $2)'],
  ['{} ist kein Feld', '$1 is not an array'],
  ['{} hat {} Dimensionen, angegeben {} Indexe', '$1 has $2 dimensions, $3 indices given'],
  ['{} hat {} Dimension, angegeben {} Indexe', '$1 has $2 dimension, $3 indices given'],
  ['{} hat {} Dimensionen, angegeben {} Index', '$1 has $2 dimensions, $3 index given'],
  ['Index {} liegt außerhalb von {} ({}..{})', 'Index $1 is outside $2 ($3..$4)'],
  ['Feldindex muss eine Ganzzahl sein, ist {}', 'Array index must be an integer, is $1'],
  ['{} hat kein Element {} (Typ {})', '$1 has no element $2 (type $3)'],
  ['{} hat kein Element {} (verfügbar: {})', '$1 has no element $2 (available: $3)'],
  ['{} hat kein Element {}', '$1 has no element $2'],
  ['Variable #{} wird nicht verwendet', 'Variable #$1 is not used'],
  [
    'Im OB gibt es nur Temp und Constant – statische Daten gehören in einen Datenbaustein',
    'An OB only has Temp and Constant – static data belongs in a data block',
  ],
  ['#{} ist bereits deklariert', '#$1 is already declared'],
  [
    'Instanzen ({}) gehören in einen Instanz-DB, z. B. {} vom Typ {}',
    'Instances ($1) belong in an instance DB, e.g. $2 of type $3',
  ],
  [
    'Nur OB1 „Main“ läuft ohne Ereignis – weise „{}“ einen Weck-, Prozessalarm oder Anlauf zu',
    'Only OB1 “Main” runs without an event – assign a cyclic interrupt, hardware interrupt or startup to “$1”',
  ],
  ['{}-OBs haben die Nummer {} (ist {})', '$1 OBs have the number $2 (is $3)'],
  ['{}-OBs haben die Nummern {} … {} (ist {})', '$1 OBs have the numbers $2 … $3 (is $4)'],
  ['Weckalarm: Takt muss 1 … 60000 ms betragen', 'Cyclic interrupt: interval must be 1 … 60000 ms'],
  [
    'Weckalarm: Phasenverschiebung muss zwischen 0 und Takt − 1 ms liegen',
    'Cyclic interrupt: phase shift must be between 0 and interval − 1 ms',
  ],
  [
    'Prozessalarm: „{}“ ist kein Eingangsbit (z. B. %I0.0)',
    'Hardware interrupt: “$1” is not an input bit (e.g. %I0.0)',
  ],
  ['Teilprozessabbild muss TPA 1 … 31 sein', 'Process image partition must be TPA 1 … 31'],
  ['Multiinstanz wird direkt aufgerufen: #{}(…)', 'A multi-instance is called directly: #$1(…)'],
  [
    'FB „{}“ braucht eine Instanz – lege einen Instanz-DB an und rufe ihn auf, z. B. {}',
    'FB “$1” needs an instance – create an instance DB and call it, e.g. $2',
  ],
  [
    'Instanzen ({}) sind nur als statische Variable möglich (Multiinstanz)',
    'Instances ($1) are only possible as static variables (multi-instance)',
  ],
  [
    '„{}“ ist eine Funktion (FC) und hat keine Instanz',
    '“$1” is a function (FC) and has no instance',
  ],
  [
    'Ein FB kann sich nicht selbst als Multiinstanz enthalten',
    'An FB cannot contain itself as a multi-instance',
  ],
  ['Konstante {} braucht einen Wert', 'Constant $1 needs a value'],
  ['{}: zu viele Elemente', '$1: too many elements'],
  ['Rekursiver Aufruf von „{}“ ist nicht möglich', 'Recursive call of “$1” is not possible'],
  [
    'Eine FC hat keinen Bereich {} – statische Daten brauchen einen FB',
    'An FC has no section $1 – static data needs an FB',
  ],
  ['Eine FC hat keinen Bereich {}', 'An FC has no section $1'],
  ['Ein FB hat keinen Bereich {}', 'An FB has no section $1'],
  [
    'Rückgabewert von „{}“: nur elementare Datentypen',
    'Return value of “$1”: elementary data types only',
  ],
  [
    'Eingänge entweder alle benannt oder alle ohne Namen angeben',
    'Give inputs either all with names or all without',
  ],
  [
    '„{}“ hat {} Eingänge/Durchgangsparameter, angegeben {}',
    '“$1” has $2 inputs/in-out parameters, $3 given',
  ],
  ['Parameter {} ist doppelt angegeben', 'Parameter $1 is given twice'],
  ['„{}“ hat keinen Parameter {} (Parameter: {})', '“$1” has no parameter $2 (parameters: $3)'],
  ['„{}“ hat keinen Parameter {}', '“$1” has no parameter $2'],
  ['{} ist ein Ausgang – verschalte ihn mit {} => …', '$1 is an output – connect it with $2 => …'],
  ['{} ist ein Eingang – versorge ihn mit {} := …', '$1 is an input – supply it with $2 := …'],
  ['Durchgangsparameter {} von „{}“ fehlt', 'In-out parameter $1 of “$2” is missing'],
  ['Durchgangsparameter {} braucht eine Variable', 'In-out parameter $1 needs a variable'],
  [
    'Durchgangsparameter {}: {} passt nicht zu {} – die Typen müssen gleich sein',
    'In-out parameter $1: $2 does not match $3 – the types must be equal',
  ],
  ['{} kann nur gelesen werden', '$1 can only be read'],
  ['Eingang {} von „{}“ fehlt', 'Input $1 of “$2” is missing'],
  [
    'Ausgang {} ist vom Typ {} – verschalte ihn mit einer Variablen gleichen Typs',
    'Output $1 is of type $2 – connect it to a variable of the same type',
  ],
  [
    '„{}“ ist ein FB – rufe seinen Instanz-DB als Anweisung auf, z. B. {}',
    '“$1” is an FB – call its instance DB as a statement, e.g. $2',
  ],
  [
    '„{}“ liefert keinen Wert (Rückgabetyp Void) – rufe sie als Anweisung auf',
    '“$1” returns no value (return type Void) – call it as a statement',
  ],
  ['Konstante vom Typ {} passt nicht zu {}', 'Constant of type $1 does not match $2'],
  ['{} ist nur innerhalb einer Schleife erlaubt', '$1 is only allowed inside a loop'],
  [
    'Das Ergebnis von {} wird nicht verwendet – Zuweisung fehlt (z. B. {})',
    'The result of $1 is not used – assignment missing (e.g. $2)',
  ],
  [
    '{} wird schon in Zeile {} unbedingt zugewiesen – die frühere Zuweisung wirkt nie',
    '$1 is already assigned unconditionally in line $2 – the earlier assignment never takes effect',
  ],
  [
    '{} wird schon in {} Zeile {} unbedingt zugewiesen – die frühere Zuweisung wirkt nie',
    '$1 is already assigned unconditionally in $2 line $3 – the earlier assignment never takes effect',
  ],
  ['CONV braucht genau einen Eingang', 'CONV needs exactly one input'],
  [
    'Typkonflikt: {} kann nicht in {} umgewandelt werden{}',
    'Type conflict: $1 cannot be converted to $2$3',
  ],
  [
    'Typkonflikt: {} kann nicht in {} umgewandelt werden',
    'Type conflict: $1 cannot be converted to $2',
  ],
  ['{} muss ein Feldelement sein, z. B. #Werte[0]', '$1 must be an array element, e.g. #Werte[0]'],
  ['{}: nur eindimensionale Felder', '$1: one-dimensional arrays only'],
  [
    '{} muss ein Element eines eindimensionalen Feldes sein',
    '$1 must be an element of a one-dimensional array',
  ],
  ['{} hat keinen Parameter {} (IN, COUNT, OUT)', '$1 has no parameter $2 (IN, COUNT, OUT)'],
  ['{} braucht IN := …, COUNT := … und OUT => …', '$1 needs IN := …, COUNT := … and OUT => …'],
  ['{}: Elemente {} und {} passen nicht zusammen', '$1: elements $2 and $3 do not match'],
  ['{}: IN muss vom Typ {} sein', '$1: IN must be of type $2'],
  ['RD_SYS_T braucht OUT => Variable vom Typ DTL', 'RD_SYS_T needs OUT => variable of type DTL'],
  ['Teilzugriff {} geht nur in einer Zuweisung', 'Slice access $1 only works in an assignment'],
  ['{} ist vom Typ {} – greife auf ein Element zu', '$1 is of type $2 – access an element'],
  ['Instanz {} kann nicht zugewiesen werden', 'Instance $1 cannot be assigned'],
  ['{} ist eine Konstante', '$1 is a constant'],
  [
    'Schreibzugriff auf Eingang {} – wird im nächsten Zyklus überschrieben',
    'Write access to input $1 – overwritten in the next cycle',
  ],
  [
    'CASE-Ausdruck muss eine Ganzzahl sein (SInt … ULInt), ist {}',
    'CASE expression must be an integer (SInt … ULInt), is $1',
  ],
  ['CASE-Marke liegt außerhalb von {}', 'CASE label is outside $1'],
  [
    'Bereich ist leer: Untergrenze größer als Obergrenze',
    'Range is empty: lower bound greater than upper bound',
  ],
  [
    'Laufvariable braucht einen festen Speicherplatz (kein variabler Index)',
    'The loop variable needs a fixed location (no variable index)',
  ],
  [
    'Laufvariable muss eine Ganzzahl sein (SInt … ULInt)',
    'The loop variable must be an integer (SInt … ULInt)',
  ],
  ['Schrittweite 0 ergibt eine Endlosschleife', 'Step 0 results in an endless loop'],
  [
    '{} ist eine Funktion und liefert einen Wert – verwende sie in einer Zuweisung',
    '$1 is a function and returns a value – use it in an assignment',
  ],
  [
    'Multiinstanzen (#Instanz(…)) gibt es nur in Funktionsbausteinen – lege im OB einen Instanz-DB an',
    'Multi-instances (#Instanz(…)) only exist in function blocks – create an instance DB in the OB',
  ],
  ['{} ist keine Instanz', '$1 is not an instance'],
  ['{} ist vom Typ {} – {} passt nicht dazu', '$1 is of type $2 – $3 does not fit'],
  [
    '{} ist vom Typ {} und wird direkt aufgerufen: {}(…)',
    '$1 is of type $2 and is called directly: $3(…)',
  ],
  [
    '{} wird bereits als {} verwendet – lege für {} einen eigenen DB an',
    '$1 is already used as $2 – create a separate DB for $3',
  ],
  ['{} ist vom Typ {} – rufe {}.TON(…) auf ({})', '$1 is of type $2 – call $3.TON(…) ($4)'],
  ['{} hat keinen Eingang {} (Eingänge: {})', '$1 has no input $2 (inputs: $3)'],
  ['{} hat keinen Ausgang {} (Ausgänge: {})', '$1 has no output $2 (outputs: $3)'],
  ['Eingang {} von {} fehlt', 'Input $1 of $2 is missing'],
  [
    'ADDR_1 von {} muss eine Merkeradresse der Partner-CPU sein (z. B. %MW100)',
    'ADDR_1 of $1 must be a memory address of the partner CPU (e.g. %MW100)',
  ],
  ['{} von {} muss eine elementare Variable sein', '$1 of $2 must be an elementary variable'],
  ['{} ({}) und ADDR_1 ({}) sind verschieden groß', '$1 ($2) and ADDR_1 ($3) differ in size'],
  ['Nach einem Teilzugriff ist kein Index möglich', 'No index is possible after a slice access'],
  [
    '{}: Teilzugriff {} nur auf Bitfolgen und Ganzzahlen',
    '$1: slice access $2 only on bit strings and integers',
  ],
  ['Teilzugriff auf {} wird nicht unterstützt', 'Slice access on $1 is not supported'],
  ['{} passt nicht in {} ({} Bit)', '$1 does not fit into $2 ($3 bits)'],
  ['Lokale Variable #{} ist nicht deklariert', 'Local variable #$1 is not declared'],
  [
    '„{}“ ist weder lokal deklariert noch eine PLC-Variable oder ein Datenbaustein',
    '“$1” is neither declared locally nor a PLC tag or a data block',
  ],
  ['#{} hat keine Elemente', '#$1 has no elements'],
  ['Datenbaustein „{}“ braucht ein Element, z. B. {}', 'Data block “$1” needs an element, e.g. $2'],
  ['„{}“ hat kein Element {}', '“$1” has no element $2'],
  ['„{}“.{} hat keine Elemente', '“$1”.$2 has no elements'],
  ['Datenbaustein „{}“ ist nicht definiert', 'Data block “$1” is not defined'],
  ['PLC-Variable „{}“ ist nicht definiert', 'PLC tag “$1” is not defined'],
  ['PLC-Variable „{}“ hat keine Elemente', 'PLC tag “$1” has no elements'],
  [
    'PLC-Variable „{}“ liegt außerhalb des Adressbereichs',
    'PLC tag “$1” is outside the address range',
  ],
  [
    'Adresse {} liegt außerhalb des Bereichs ({} Byte)',
    'Address $1 is outside the area ($2 bytes)',
  ],
  ['Zeichenkette länger als 254 Zeichen', 'String longer than 254 characters'],
  ['Wert {} liegt außerhalb von {} ({} … {})', 'Value $1 is outside $2 ($3 … $4)'],
  [
    'Instanz {} kann nicht als Wert verwendet werden – meinst du {}?',
    'Instance $1 cannot be used as a value – do you mean $2?',
  ],
  [
    'Instanz {} kann nicht als Wert verwendet werden – wähle einen Ausgang, z. B. {}',
    'Instance $1 cannot be used as a value – choose an output, e.g. $2',
  ],
  [
    'Eine Liste [ … ] gibt es nur als Startwert eines Feldes',
    'A list [ … ] only exists as the start value of an array',
  ],
  ['Ausdruck hat keinen gültigen Typ', 'Expression has no valid type'],
  ['NOT ist auf {} nicht anwendbar', 'NOT cannot be applied to $1'],
  ['Vorzeichen „-“ ist auf {} nicht anwendbar', 'Sign “-” cannot be applied to $1'],
  ['Operator {} ist nicht auf {} und {} anwendbar', 'Operator $1 cannot be applied to $2 and $3'],
  [
    '{} ist nur auf Bool und Bitfolgen (Byte, Word, DWord) anwendbar, nicht auf {}',
    '$1 can only be applied to Bool and bit strings (Byte, Word, DWord), not to $2',
  ],
  ['Operator {} ist auf Bool nicht anwendbar', 'Operator $1 cannot be applied to Bool'],
  ['Operator {} ist nicht auf {} anwendbar', 'Operator $1 cannot be applied to $2'],
  [
    'Time {} Time ist nicht sinnvoll – multipliziere mit einer Zahl',
    'Time $1 Time makes no sense – multiply by a number',
  ],
  ['{} hat keine Ausgänge ({} =>)', '$1 has no outputs ($2 =>)'],
  [
    'Parameter entweder alle benannt oder alle ohne Namen angeben',
    'Give parameters either all with names or all without',
  ],
  ['Ein Parameter ist doppelt angegeben', 'A parameter is given twice'],
  ['{}: Parameter {} fehlt', '$1: parameter $2 is missing'],
  ['{} hat keinen Parameter {} (erwartet: {})', '$1 has no parameter $2 (expected: $3)'],
  ['{}: Eingang {} fehlt', '$1: input $2 is missing'],
  ['Speicheroperand muss ein Bool sein', 'The memory operand must be a Bool'],
  ['{}: Eingänge haben unverträgliche Typen', '$1: inputs have incompatible types'],
  ['Baustein „{}“ ist nicht definiert', 'Block “$1” is not defined'],
  [
    '{} gibt es nur in FUP/KOP – in SCL mit Vergleichen formulieren, z. B. {}',
    '$1 only exists in FBD/LAD – express it with comparisons in SCL, e.g. $2',
  ],
  ['{}: Argumente haben unverträgliche Typen', '$1: arguments have incompatible types'],
  [
    '{} ist nicht auf {} anwendbar (gleicher Typ für IN0 und IN1)',
    '$1 cannot be applied to $2 (same type for IN0 and IN1)',
  ],
  [
    '{} ist nicht auf {} anwendbar (gleicher Typ für alle Eingänge)',
    '$1 cannot be applied to $2 (same type for all inputs)',
  ],
  ['{} ist nicht auf {} anwendbar ({})', '$1 cannot be applied to $2 ($3)'],
  [
    'NORM_X erwartet Zahlen für MIN, VALUE und MAX',
    'NORM_X expects numbers for MIN, VALUE and MAX',
  ],
  [
    'SCALE_X: MIN und MAX haben unverträgliche Typen',
    'SCALE_X: MIN and MAX have incompatible types',
  ],
  ['SCALE_X ist nicht auf {} anwendbar', 'SCALE_X cannot be applied to $1'],
  [
    '{} erwartet eine Bitfolge (Byte, Word, DWord), erhalten {}',
    '$1 expects a bit string (Byte, Word, DWord), got $2',
  ],
  ['RUNTIME: MEM muss vom Typ LReal sein, ist {}', 'RUNTIME: MEM must be of type LReal, is $1'],
  [
    'SWAP erwartet Word, DWord oder LWord, erhalten {}',
    'SWAP expects Word, DWord or LWord, got $1',
  ],
  ['Kein passender Typ für {}', 'No matching type for $1'],
  // Lexer und Parser
  [
    'Zeitangabe erwartet, z. B. T#500ms oder T#1s200ms',
    'Time literal expected, e.g. T#500ms or T#1s200ms',
  ],
  ['Ungültige Zeitangabe', 'Invalid time literal'],
  ['Kommentar wird nicht geschlossen', 'Comment is not closed'],
  ['Nach # wird ein Variablenname erwartet', 'A variable name is expected after #'],
  ['Anführungszeichen wird nicht geschlossen', 'Quote is not closed'],
  ['Leerer Name in Anführungszeichen', 'Empty name in quotes'],
  ['Teilzugriff erwartet, z. B. .%X3 oder .%B1', 'Slice access expected, e.g. .%X3 or .%B1'],
  [
    'Ungültige Adresse (z. B. %I0.0, %IB0, %IW64, %MD10)',
    'Invalid address (e.g. %I0.0, %IB0, %IW64, %MD10)',
  ],
  ['Ungültige Zahl', 'Invalid number'],
  ['Ungültiges Datum', 'Invalid date'],
  ['Ungültige Uhrzeit', 'Invalid time of day'],
  ['BOOL# erwartet TRUE, FALSE, 0 oder 1', 'BOOL# expects TRUE, FALSE, 0 or 1'],
  ['{}# erwartet eine ganze Zahl', '$1# expects an integer'],
  ['Unerwartetes Zeichen „{}“', 'Unexpected character “$1”'],
  ['{} fehlt', '$1 is missing'],
  [
    'Konstante braucht einen Wert (name : Typ := wert;)',
    'A constant needs a value (name : Type := value;)',
  ],
  [
    'Variablen werden in der Bausteinschnittstelle deklariert, nicht im Code',
    'Variables are declared in the block interface, not in the code',
  ],
  ['Unerwartetes Schlüsselwort {}', 'Unexpected keyword $1'],
  ['CASE-Marke muss eine ganze Zahl sein, gefunden {}', 'CASE label must be an integer, found $1'],
  [
    'CASE-Marke erwartet (z. B. 1: oder 2..5:), gefunden {}',
    'CASE label expected (e.g. 1: or 2..5:), found $1',
  ],
  [
    'Konstantennamen als CASE-Marke werden nicht unterstützt',
    'Constant names as CASE labels are not supported',
  ],
  [
    '{} hat keinen Parameter ELSE – der Ersatzwert heißt INELSE',
    '$1 has no parameter ELSE – the default value is called INELSE',
  ],
  ['Name nach „.“ erwartet', 'Name expected after “.”'],
  ['Fehler in Zeile {}, Spalte {}: {}', 'Error in line $1, column $2: $3'],
  ['Warnung in Zeile {}, Spalte {}: {}', 'Warning in line $1, column $2: $3'],
  // Adressen, Variablentabelle
  [
    'Ungültige Adresse „{}“ (erwartet z. B. %I0.0, %IB0, %IW64, %MD10)',
    'Invalid address “$1” (expected e.g. %I0.0, %IB0, %IW64, %MD10)',
  ],
  [
    'String ist nur in Datenbausteinen und lokal möglich, nicht im E/A- oder Merkerbereich',
    'String is only possible in data blocks and locally, not in the I/O or memory area',
  ],
  [
    '{} ist nur in Datenbausteinen und lokal möglich, nicht im E/A- oder Merkerbereich',
    '$1 is only possible in data blocks and locally, not in the I/O or memory area',
  ],
  [
    'Ungültiger Name „{}“ (Buchstaben, Ziffern, _; nicht mit Ziffer beginnen)',
    'Invalid name “$1” (letters, digits, _; must not start with a digit)',
  ],
  ['Name „{}“ ist bereits vergeben', 'Name “$1” is already used'],
  ['Typ {} passt nicht zur Adresse {}', 'Type $1 does not match address $2'],
  // Schaltschrank
  ['Unbekanntes Modul „{}“', 'Unknown module “$1”'],
  ['{} ist in diesem Auftrag nicht zugelassen', '$1 is not permitted in this job'],
  ['{} ragt über die Hutschiene hinaus', '$1 sticks out beyond the DIN rail'],
  ['{} steht auf der Trennwand', '$1 is on the partition'],
  ['{} überlappt mit einem anderen Modul', '$1 overlaps another module'],
  [
    '{} {}: Anfangsadresse {} ungültig (Analog: gerade Byteadresse)',
    '$1 $2: start address $3 invalid (analog: even byte address)',
  ],
  ['Adressen von {} überschneiden sich mit {} ({})', 'Addresses of $1 overlap with $2 ($3)'],
  [
    '{} steht links von jeder CPU und ist nicht angebunden',
    '$1 is left of every CPU and not connected',
  ],
  ['Interfacemodul {}: keine CPU zugeordnet', 'Interface module $1: no CPU assigned'],
  [
    'Ein Koppelmodul gehört neben die CPU, nicht in eine dezentrale Station',
    'A coupler module belongs next to the CPU, not in a distributed station',
  ],
  ['Ein Koppelmodul hat keinen Partner', 'A coupler module has no partner'],
  ['Je CPU ist nur ein Koppelmodul möglich', 'Only one coupler module per CPU is possible'],
  ['Es ist keine CPU gesteckt', 'No CPU is plugged in'],
  [
    '{} ist ein Element des Bedienpanels und wird nicht verdrahtet',
    '$1 is an operator panel element and is not wired',
  ],
  ['Leitung zu einem unbekannten Gerät oder Modul', 'Cable to an unknown device or module'],
  ['{} hat keinen Kanal {}', '$1 has no channel $2'],
  ['{} braucht einen {}-Kanal, nicht {}', '$1 needs a $2 channel, not $3'],
  [
    '{} ist ein Leistungsverbraucher und braucht einen Relaisausgang',
    '$1 is a power consumer and needs a relay output',
  ],
  [
    'Die Leitung von {} kann die Trennwand nicht kreuzen',
    'The cable of $1 cannot cross the partition',
  ],
  ['Kanal {} von {} ist doppelt belegt', 'Channel $1 of $2 is used twice'],
  ['{} ist mehrfach angeschlossen', '$1 is connected several times'],
  ['{} liefert {}, der Kanal ist auf {} eingestellt', '$1 delivers $2, the channel is set to $3'],
  [
    'Kabelkanal in Spalte {} ist überfüllt ({} von {} Leitungen)',
    'Cable duct in column $1 is overfull ($2 of $3 cables)',
  ],
  [
    '{}: {} ist keine passende Merkeradresse (Bit, z. B. %M200.0)',
    '$1: $2 is not a suitable memory address (bit, e.g. %M200.0)',
  ],
  [
    '{}: {} ist keine passende Merkeradresse (Wort, z. B. %MW220)',
    '$1: $2 is not a suitable memory address (word, e.g. %MW220)',
  ],
  ['{} ist nicht angeschlossen', '$1 is not connected'],
  // CPU, Diagnosepuffer, Laufzeit
  ['Für {} ({}) fehlt ein übersetztes Programm', 'A compiled program is missing for $1 ($2)'],
  ['Lastspannung fehlt an {}', 'Load voltage missing at $1'],
  ['Drahtbruch {} Kanal {} ({})', 'Wire break $1 channel $2 ($3)'],
  ['Baugruppe {} gezogen bzw. ausgefallen', 'Module $1 pulled or failed'],
  ['Baugruppe {} wieder gesteckt', 'Module $1 plugged in again'],
  ['Station {} ausgefallen', 'Station $1 failed'],
  ['Station {} wieder erreichbar', 'Station $1 reachable again'],
  ['Feldindex außerhalb (0…{})', 'Array index out of range (0…$1)'],
  ['Operand nicht beschreibbar', 'Operand not writable'],
  ['{}: Index {} außerhalb {}…{}', '$1: index $2 outside $3…$4'],
  ['Anlauf (Warmstart)', 'Startup (warm restart)'],
  ['Zykluszeitüberschreitung – OB80 aufgerufen', 'Cycle time exceeded – OB80 called'],
  ['Zykluszeitüberschreitung zweimal hintereinander', 'Cycle time exceeded twice in a row'],
  ['Zykluszeitüberschreitung', 'Cycle time exceeded'],
  ['Programmierfehler: {}', 'Programming error: $1'],
  [
    'Zykluszeitüberschreitung: mehr als {} Befehle in einem Zyklus',
    'Cycle time exceeded: more than $1 instructions in one cycle',
  ],
  ['Programmierfehler: {} – kein OB121', 'Programming error: $1 – no OB121'],
  ['Betriebsartenschalter auf STOP', 'Mode switch set to STOP'],
  ['STOP: {}', 'STOP: $1'],
  ['kommend: {}', 'coming: $1'],
  ['gehend: {}', 'going: $1'],
  ['Meldungen quittiert', 'Alarms acknowledged'],
  ['Spannung aus', 'Power off'],
  ['Spannung ein', 'Power on'],
  // Prüfergebnis
  ['Variable {} nicht gefunden', 'Variable $1 not found'],
  ['bei {}: {} = {} statt {}', 'at $1: $2 = $3 instead of $4'],
  ['bei {} ist {} = {}', 'at $1, $2 = $3'],
  ['bei {} gleichzeitig: {}', 'at $1 at the same time: $2'],
  ['bei {} Abweichung {}', 'at $1 deviation $2'],
  ['bei {}: {}', 'at $1: $2'],
  ['{} Schaltvorgänge (erlaubt {})', '$1 switching operations (allowed $2)'],
  ['Fenster ab {}: {} % statt {} %', 'Window from $1: $2 % instead of $3 %'],
  ['Keine Forceaufträge aktiv', 'No force jobs active'],
];

/** Ergänzungen aus dem Parser („… erwartet nach der IF-Bedingung“) */
const CONTEXT: Record<string, string> = {
  'am Ende der Deklaration': 'at the end of the declaration',
  'nach der Länge': 'after the length',
  'für eine Zuweisung': 'for an assignment',
  'am Ende der Anweisung': 'at the end of the statement',
  'nach der IF-Bedingung': 'after the IF condition',
  'nach der ELSIF-Bedingung': 'after the ELSIF condition',
  'zum Abschluss von IF': 'to close IF',
  'nach der CASE-Marke': 'after the CASE label',
  'zum Abschluss von CASE': 'to close CASE',
  'nach der Laufvariable': 'after the loop variable',
  'in der FOR-Anweisung': 'in the FOR statement',
  'zum Abschluss von FOR': 'to close FOR',
  'nach der WHILE-Bedingung': 'after the WHILE condition',
  'zum Abschluss von WHILE': 'to close WHILE',
  'in der REPEAT-Anweisung': 'in the REPEAT statement',
  'zum Abschluss von REPEAT': 'to close REPEAT',
  'zum Schließen der Klammer': 'to close the parenthesis',
  'vor dem Anweisungsteil': 'before the statement section',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS: [RegExp, string][] = TABLE.map(([de, en]) => [
  new RegExp(`^${escape(de).replace(/\\\{\\\}/g, '(.+?)')}$`, 's'),
  en,
]);

/** deutsche Meldung ins Englische; Unbekanntes bleibt, wie es ist */
export function translateMessage(text: string): string {
  const exp = /^(?:„(.+?)“|(\S+)) erwartet(?: (.+?))?(?:, gefunden (.+))?$/s.exec(text);
  if (exp) {
    const what = exp[1] ? `“${exp[1]}”` : exp[2];
    const ctx = exp[3] ? ` ${CONTEXT[exp[3]] ?? exp[3]}` : '';
    const found = exp[4] ? `, found ${exp[4].replace(/^„(.*)“$/s, '“$1”')}` : '';
    return `${what} expected${ctx}${found}`;
  }
  for (const [re, en] of PATTERNS) {
    const m = re.exec(text);
    if (m) {
      return en.replace(/\$(\d)/g, (_, n: string) => {
        const part = m[Number(n)] ?? '';
        // eingebettete Meldungen (z. B. nach „: “) mitübersetzen
        return n === String(m.length - 1) && /[a-zäöü] /i.test(part)
          ? translateMessage(part)
          : part;
      });
    }
  }
  return text;
}
