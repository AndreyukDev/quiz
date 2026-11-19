## Главное в пяти правилах
- **Важен только знак.** `compare` возвращает «меньше нуля / ноль / больше нуля», не обязательно `-1`/`1`. Проверять `< 0`, а не `== -1`; сравнивать через `Integer.compare`, а не вычитанием.
- **Для `TreeSet`/`TreeMap` `compare == 0` — это равенство.** `equals` и `hashCode` они не вызывают вообще.
- **Разворот и `null` — у конкретного ключа**, а не у всей цепочки: `thenComparing(key, reverseOrder())`, `comparing(key, nullsLast(naturalOrder()))`.
- **Целевой тип не проходит через цепочку**: `comparing(s -> s.length()).reversed()` не компилируется. Ссылка на метод (`String::length`) или явный тип параметра.
- **Поля, по которым сравнивают, у ключа менять нельзя** — дерево не перестроится, и элемент «потеряется».

## Comparable и Comparator
- `Comparable<T>` — натуральный порядок, один, внутри класса: `String`, числа, `LocalDate`, `BigDecimal`, enum (по порядку объявления, `compareTo` — `final`).
- `Comparator<T>` — внешний порядок, сколько угодно, для чужих классов. Натурального порядка у `User` нет — значит, только компараторы.
- `record` сам `Comparable` не становится.

## Контракт
- Антисимметрия: `sgn(a.compareTo(b)) == -sgn(b.compareTo(a))`.
- Транзитивность: `a > b` и `b > c` ⇒ `a > c`.
- Равные одинаково относятся к третьему: `a == b` ⇒ `sgn(a ? c) == sgn(b ? c)`.
- `x.compareTo(null)` бросает NPE (а `equals(null)` — `false`).
- Согласованность с `equals` (`compare == 0` ⇔ `equals`) **рекомендуется**, но не обязательна. Исключение из JDK — `BigDecimal`: `1.0` и `1.00` не `equals`, но `compareTo == 0`.
- Нарушил контракт — TimSort может бросить `IllegalArgumentException: Comparison method violates its general contract!`, а может молча отсортировать неверно.

## Порядок не согласован с equals — что ломается
- Сортировка, `PriorityQueue`, `binarySearch` — работают.
- `TreeSet`/`TreeMap` схлопывают элементы с `compare == 0`: второй молча не добавляется.
- `treeSet.equals(hashSet)` может быть `true`, а `hashSet.equals(treeSet)` — `false`.
- Частый баг: `new TreeSet<>(comparingInt(User::getAge))` — люди одного возраста становятся одним. Лечится tie-breaker'ом по уникальному полю.

## Как писать compareTo
```java
private static final Comparator<Person> ORDER =
        Comparator.comparing(Person::lastName)
                  .thenComparing(Person::firstName)
                  .thenComparingInt(Person::age);

@Override
public int compareTo(Person o) { return ORDER.compare(this, o); }
```
- Не `a - b`: `Integer.MIN_VALUE - 1` переполняется. Для `long` — `(int) (a - b)` ещё и режет биты.
- Не сумма результатов: `1 + (-1) == 0` — «равны».
- `double` — только `Double.compare`: он упорядочивает `-0.0 < 0.0` и ставит `NaN` после всех; `<` с `NaN` ломает транзитивность.
- `Boolean`: `false < true` — активных вперёд сортирует `reversed()`.
- Наследник не может стать `Comparable<Child>`, если предок уже `Comparable<Parent>` — не компилируется. Новое значимое поле в наследнике ломает контракт — композиция вместо наследования.

## Comparator API
```java
Comparator.comparing(Employee::getDepartment, Comparator.nullsLast(Comparator.naturalOrder()))
          .thenComparing(Comparator.comparingLong(Employee::getSalary).reversed())
          .thenComparingLong(Employee::getId);
```
- `comparingInt`/`Long`/`Double` — без упаковки ключа.
- `reversed()` разворачивает **весь** компаратор, на котором вызван.
- `nullsFirst(cmp)` обрабатывает `null` самих сравниваемых объектов; для `null` в поле — вторым аргументом `comparing`.
- `list.sort(null)` = натуральный порядок, на `null`-элементе — NPE.
- `Objects.compare(a, b, cmp)` не null-безопасен: `0` только при `a == b`.
- Разворачивать вручную — переставить аргументы `cmp.compare(b, a)`, а не `-cmp.compare(a, b)` (`-MIN_VALUE == MIN_VALUE`).
- `Map.Entry.comparingByValue(Comparator.reverseOrder())` — сортировка записей по значению по убыванию.
- `Comparator` функциональный, хотя в нём есть `equals`: методы `Object` не считаются.
- Компаратор в `TreeMap`, который сериализуют, сам должен быть `Serializable`; лямбда — нет, `comparing(...)` — только если сериализуем извлекатель ключа.

## Строки
- `String.compareTo` — разность кодов UTF-16 первого различающегося символа, иначе разность длин. Заглавные латинские раньше строчных, `ё` после `я`.
- `String.CASE_INSENSITIVE_ORDER` убирает регистр, но не знает языка.
- Для текста, который видит человек, — `Collator.getInstance(locale)`; для больших списков — `CollationKey`.

## Сортировка и коллекции
- `List.sort`, `Collections.sort`, `Arrays.sort(Object[])` — **стабильны**: равные не меняются местами. `Arrays.sort(int[])` — нет, но примитивы неразличимы.
- `Collections.sort(list)` проверяет `Comparable` при компиляции; `List.sort(null)`, `stream().sorted()`, `new TreeSet<>()` — только в рантайме (`ClassCastException`).
- `binarySearch` — только тем же порядком, которым сортировали, иначе результат не определён.
- `TreeMap` допускает ключ `null`, если компаратор его умеет.
- Top-K наибольших — min-куча (`PriorityQueue` в натуральном порядке) размером K: `offer`, при K+1 — `poll`. O(n log k).
- `int[]` по убыванию компаратором не отсортировать: только `Integer[]`, стрим с `boxed()` или сортировка + разворот.
- `Arrays.compare(a, b)` — лексикографическое сравнение массивов (Java 9); `Arrays::compare` — готовый компаратор для `int[]`.
- `HashMap` при множестве коллизий строит дерево в бакете; если ключ `Comparable`, поиск там — O(log n).

## max и min
- `Stream.max/min` → `Optional`; `Collections.max/min` → элемент, на пустой коллекции — `NoSuchElementException`.
- Какой из равных вернётся, спецификация не обещает — нужен tie-breaker.
- `Collectors.maxBy` в `groupingBy` даёт `Optional` в значениях; без него — `collectingAndThen(maxBy(cmp), Optional::get)` или `toMap(..., BinaryOperator.maxBy(cmp))`.

## Даты
- `ZonedDateTime`/`OffsetDateTime.compareTo` равен нулю только при совпадении момента **и** зоны. Один момент в разных зонах — `isEqual`, или сравнивать `toInstant()`.
