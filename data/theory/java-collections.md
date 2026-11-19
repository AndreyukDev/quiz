## Главное в шести правилах
- **Ключ хеш-коллекции не меняют.** Поля, участвующие в `equals`/`hashCode`, у ключа `HashMap`/`HashSet` трогать нельзя: запись останется в мапе, но найти её станет нельзя.
- **Во время обхода коллекцию меняют только через итератор.** Добавил или удалил элемент мимо итератора — `ConcurrentModificationException` (а может, и нет: fail-fast лишь старается). Удалять — `iterator.remove()` или `removeIf`.
- **Вид — это не копия.** `unmodifiableList`, `Arrays.asList`, `subList`, `reversed()`, `keySet()` — окна на источник: его изменения видны. Снимок дают `List.copyOf`, `new ArrayList<>(src)`.
- **Новые фабрики неизменяемы полностью и не терпят `null`.** `List.of`/`Set.of`/`Map.of`/`copyOf`: любой мутирующий метод — UOE, `null` — NPE, даже в `contains(null)`. Старые `Collections.*` и `Arrays.asList` `null` допускают.
- **Любая копия поверхностная.** Копируется структура, элементы общие: изменяемый элемент меняется и в «защитной копии».
- **Порядок обхода есть, только если класс его обещает.** `HashSet`, `HashMap`, `Set.of` — порядок не задан; `LinkedHash*` — вставки (или доступа); `Tree*` — сортировка; `PriorityQueue` — только голова.

## HashMap и ConcurrentHashMap
- В OpenJDK бакет — `(n - 1) & hash`, поэтому ёмкость — степень двойки, а `hash()` подмешивает старшие 16 бит в младшие: `h ^ (h >>> 16)`.
- Resize при `size > capacity * loadFactor` (0.75): ёмкость удваивается; в OpenJDK узел остаётся на `i` или переезжает на `i + oldCap` — решает один бит хеша.
- `get`/`put` — O(1) в среднем. При коллизиях в OpenJDK бакет длиннее 8 становится красно-чёрным деревом (если таблица ≥ 64, иначе — resize): O(log n), а для не-`Comparable` ключей с равными хешами — до O(n).
- Узел хранит хеш, посчитанный при `put`. Изменил ключ — `get` ищет не в том бакете, `size()` не уменьшился: утечка.
- `new HashMap<>(n)` — это ёмкость, а не число элементов: на `n` записей resize может случиться (порог — 0.75 ёмкости). Под `n` записей — `HashMap.newHashMap(n)` (Java 19).
- `HashMap` допускает один `null`-ключ и `null`-значения. `get(k) == null` не отличает «нет ключа» от «значение null» — нужен `containsKey`.
- `computeIfAbsent`, если функция вернула `null`, ничего не кладёт. Менять ту же мапу внутри функции нельзя: `HashMap` старается бросить CME.
- `ConcurrentHashMap` запрещает `null` и в ключах, и в значениях: в конкурентной мапе `get` → `null` должен однозначно значить «ключа нет».
- В CHM атомарны отдельные методы: `compute`, `merge`, `putIfAbsent`, `computeIfAbsent`. Пара `get` + `put` — check-then-act, гонка.
- Итераторы CHM слабо согласованные: CME не бросают, изменения во время обхода могут увидеть, а могут нет. `size()` под нагрузкой — оценка.

## ConcurrentModification
- Структурная модификация — добавить или удалить элемент (отображение). Замена значения по существующему ключу, `entry.setValue`, `list.set` — не структурные.
- for-each — это `Iterator`; каждое `next()` сверяет `modCount`. Удаление в цикле через `list.remove` — CME. Но удаление предпоследнего элемента проскакивает: `hasNext()` вернёт `false` раньше проверки.
- **CME — не только про потоки.** Чаще всего это один поток, который меняет коллекцию в собственном цикле.
- Правильно: `iterator.remove()`, `list.removeIf(p)`, `map.entrySet().removeIf(...)`, `map.replaceAll(...)`.
- `subList` — вид на родителя: структурно изменил родителя мимо `subList` — поведение вида не определено, у `ArrayList` любое обращение к нему даёт CME. `list.subList(a, b).clear()` — быстрый способ удалить диапазон.
- В `LinkedHashMap` с порядком доступа даже `get` — структурная модификация.
- `CopyOnWriteArrayList` обходит снимок массива: CME нет, изменения в цикле не видны, `iterator.remove()` — UOE. Каждая запись копирует массив — только для редких записей (слушатели).

## Неизменяемые коллекции и виды
- `List.of` / `Set.of` / `Map.of`, `copyOf`, `Collectors.toUnmodifiable*` — неизменяемы, `null` запрещён. Мутирующий метод бросает UOE **всегда**, даже если менять нечего.
- `Set.of` и `Map.of` с повтором — `IllegalArgumentException` (опасно, когда аргументы — переменные). `Set.copyOf` повторы молча схлопывает.
- Порядок обхода `Set.of`/`Map.of` меняется от запуска к запуску JVM (случайная соль). В тестах сравнивать множества, а не `toString()`.
- `Arrays.asList` — фиксированный размер поверх массива: `set`, `sort`, `replaceAll` работают и пишут в массив; `add`/`remove` — UOE. `null` можно. `removeIf` без совпадений — без исключения, с совпадением — UOE.
- `Arrays.asList(int[])` и `List.of(int[])` дают `List<int[]>` из одного элемента.
- `Collections.emptyList`, `singletonList`, `nCopies` — неизменяемы, `null` допускают; `nCopies` массив не выделяет.
- `keySet()`, `values()`, `entrySet()` — виды на мапу: удаление через них удаляет запись, `add` — UOE.
- `reversed()` (Java 21, `SequencedCollection`) — вид в обратном порядке, изменения проходят в обе стороны. Там же `getFirst`/`getLast`/`addFirst`/`removeLast`; у пустой коллекции `getFirst` — `NoSuchElementException`.

## Копирование и toArray
- Двумерный массив — массив ссылок на строки: `clone()` копирует только внешний. Глубоко: `Arrays.stream(m).map(int[]::clone).toArray(int[][]::new)`.
- `toArray()` возвращает `Object[]`: `(String[]) list.toArray()` компилируется и падает с `ClassCastException`.
- Типизированный массив — `toArray(String[]::new)` (11) или `toArray(new String[0])`. Предразмеренный `new String[size()]` не быстрее, а у конкурентной коллекции может оставить `null` в хвосте.

## Выбор коллекции
- Список — `ArrayList`. `LinkedList` выигрывает редко: O(1) вставки только при найденном узле, поиск позиции — O(n) по разбросанной памяти, узел — 24 байта (40 без сжатых ссылок) против ссылки.
- Очередь и стек — `ArrayDeque` (O(1) на обоих концах, `null` не принимает), а не `Stack` и не `LinkedList`.
- Множество: `HashSet` — O(1), без порядка; `LinkedHashSet` — порядок вставки, повторная вставка его не меняет; `TreeSet` — сортировка, O(log n), дубликат — всё, где `compare == 0`.
- Сравнение и сортировка, `TreeSet`/`TreeMap`, top-K на `PriorityQueue` — в теории раздела Comparable и Comparator.
- `PriorityQueue` — двоичная куча: `peek`/`poll` дают минимум, а итератор и `toString()` идут в порядке массива кучи, не отсортированно.
- LRU-кэш в пару строк — `LinkedHashMap(cap, 0.75f, true)` + `removeEldestEntry`. Не потокобезопасен; в проде — Caffeine.
- `LinkedHashMap` в порядке вставки: `put` по существующему ключу позицию не меняет.
- `EnumMap`/`EnumSet` — для ключей-enum: массив или битовая маска, быстрее и компактнее хеш-версий.
- Конкурентно: `ConcurrentHashMap`, `CopyOnWriteArrayList` (много чтений, мало записей), `BlockingQueue` для producer/consumer. `Collections.synchronizedList` обход не защищает — `synchronized (list)` вокруг цикла вручную.
