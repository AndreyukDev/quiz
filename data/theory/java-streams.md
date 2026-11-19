## Главное в шести правилах
- **Стрим ленив и идёт по элементу.** Без терминальной операции не выполнится ничего; элемент проходит весь конвейер, прежде чем начнётся следующий, и короткое замыкание (`findFirst`, `limit`, `anyMatch`) обрывает обход.
- **Стрим одноразовый.** После терминальной операции — `IllegalStateException`. Хранить источник или `Supplier<Stream<T>>`, а не сам стрим.
- **Лямбды в стриме — без побочных эффектов.** Не менять источник, не писать во внешнее состояние: результат собирать через `collect`/`reduce`. Стрим вправе вообще не вызвать `peek` и `map`.
- **У коллектора свои правила о дубликатах и `null`.** `toMap` падает на повторном ключе и на `null`-значении; `groupingBy` собирает повторы в группу; тип мапы не гарантирован.
- **Аргумент вычисляется до вызова.** `orElse(f())` вызывает `f()` всегда, `orElseGet(() -> f())` — только для пустого `Optional`. То же у ссылки на метод: в `obj::m` `obj` вычисляется и проверяется на `null` сразу.
- **Лямбда захватывает значение, а не переменную.** Поэтому локальные переменные — только effectively final; обход через `int[]` или поле возвращает общее изменяемое состояние и гонки.

## Stream API: как выполняется
- Операции: промежуточные (ленивые, возвращают стрим) и терминальные (запускают обход).
- Stateless (`filter`, `map`, `flatMap`) пропускают элемент сразу. Stateful (`sorted`, `distinct`, `limit`, `skip`) помнят состояние; `sorted` должен увидеть **все** элементы, прежде чем выдать первый, — на бесконечном стриме не завершится.
- `peek` перед `sorted` отработает для всех элементов раньше, чем что-то пройдёт дальше.
- `count()` с Java 9 может не обходить элементы, если размер известен: `list.stream().peek(...).count()` не вызовет `peek`. С `filter` перед `count` — вызовет.
- Бесконечные: `Stream.generate`, `Stream.iterate(seed, f)` — только с `limit`/`takeWhile`. `Stream.iterate(seed, hasNext, next)` (9) — как цикл `for`.
- `takeWhile`/`dropWhile` (9) режут по первому несовпадению, а не фильтруют: `[1, 2, 5, 1]` с `x < 3` → `[1, 2]` и `[5, 1]`.
- `flatMap` разворачивает стрим стримов; `mapMulti` (16) делает то же через `Consumer`-приёмник, без создания стримов.
- `distinct` — по `equals`/`hashCode`.
- `findFirst` и `max`/`min` на `null`-результате бросают NPE.
- Примитивные `IntStream`/`LongStream`/`DoubleStream` не упаковывают: `mapToInt(...).sum()`; `average()` и `max()` дают `OptionalDouble`/`OptionalInt`. `boxed()` — обратно в `Stream<Integer>`.
- Gatherers (`Stream.gather`, свои промежуточные операции) — preview в 22–23, финал в 24 (JEP 485): в Java 21 их нет, в 25 есть.

## Stream API: коллекторы
- `toMap(k, v)` на повторном ключе — `IllegalStateException: Duplicate key`; на `null`-значении — NPE. Нужен merge: `toMap(k, v, (a, b) -> a)`; четвёртый аргумент — фабрика мапы.
- `groupingBy(k)` → `Map<K, List<T>>`; `null`-ключ — NPE. Downstream сворачивает группу: `counting()` (даёт `Long`), `mapping(f, toSet())`, `summingInt`, `maxBy` (даёт `Optional`), `collectingAndThen`.
- Тип мапы и списка по умолчанию не обещан. Нужен порядок — фабрика: `groupingBy(k, TreeMap::new, downstream)`.
- `partitioningBy(p)` — всегда оба ключа `false` и `true`, даже пустые. `groupingBy` по `boolean` пустую группу не создаст: `get(true)` → `null`.
- `teeing(c1, c2, merger)` (12) — два коллектора за один проход.
- `stream.toList()` (16) — неизменяемый, `null` допускает; `Collectors.toList()` — изменяемость не обещана; `toUnmodifiableList()` — неизменяемый, на `null` NPE.
```java
Map<Character, List<Integer>> lens = Stream.of("apple", "avocado", "bob")
        .collect(groupingBy(s -> s.charAt(0), TreeMap::new,
                            mapping(String::length, toList())));
// {a=[5, 7], b=[3]}
```
- `reduce(identity, op)`: `identity` — нейтральный элемент (`0` для суммы), `op` ассоциативна. `Stream.of(1, 2, 3, 4).reduce(10, Integer::sum)` даёт 20 последовательно и другое число в параллели. `reduce(op)` без identity → `Optional`.

## Stream API: побочные эффекты и parallel
- Функции должны быть non-interfering (источник не меняют) и stateless (не зависят от изменяемого внешнего состояния). `forEach(list::add)` — антипаттерн, `collect` — правильно.
- Все параллельные стримы делят `ForkJoinPool.commonPool()`. Блокирующий IO в нём тормозит всё приложение, включая `CompletableFuture` без своего executor'а.
- Параллель окупается на больших данных, дорогой операции и хорошо делимом источнике (`ArrayList`, массив, `IntStream.range`). Плохо: `LinkedList`, `iterate`, IO.
- Порядок в параллели дорог: `findFirst`, `limit`, `forEachOrdered`. Если порядок не нужен — `findAny`, `unordered()`. `forEach` в параллели порядок не соблюдает, `toList()` — соблюдает порядок встречи.

## Optional
- Для возвращаемого значения «результата может не быть». Не для полей, параметров и коллекций; переменная типа `Optional` сама не должна быть `null`.
- `Optional.of(null)` — NPE; `ofNullable` — пустой.
- `map` оборачивает результат как `ofNullable`: функция вернула `null` → `empty()`. `flatMap` требует непустую ссылку на `Optional`, `null` → NPE.
- `get()` и `orElseThrow()` (10) на пустом — `NoSuchElementException`; поведение одинаковое, но имя `orElseThrow` честнее.
- `Stream<Optional<T>>` → значения: `flatMap(Optional::stream)`.
- `Optional` value-based: на `==`, `synchronized`, `identityHashCode` не полагаться, сравнивать через `equals`.
- `OptionalInt`/`Long`/`Double` — без упаковки, но без `map`/`flatMap`.

## Лямбды и ссылки на методы
- Функциональный интерфейс — ровно один абстрактный метод; методы `Object` и `default` не считаются. `@FunctionalInterface` проверяет это при компиляции.
- `this` в лямбде — внешний объект; в анонимном классе — сам анонимный объект. Лямбда не вводит новую область видимости: имя локальной переменной внешнего метода повторить нельзя.
- Четыре вида ссылок: статическая `Integer::parseInt`; связанная `obj::m` (получатель зафиксирован); несвязанная `String::length` (получатель — первый параметр); конструктор `ArrayList::new`.
- В `obj::m` выражение `obj` вычисляется **один раз** при создании ссылки, и `null` даёт NPE сразу. Лямбда `() -> obj.m()` разыменует `obj` только при вызове.
- Стандартные `Function`, `Supplier` и т. д. не объявляют checked-исключений: внутри лямбды их надо ловить или заворачивать.
