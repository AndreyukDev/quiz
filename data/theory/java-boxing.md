## Главное в четырёх правилах
- **Где встретились примитив и обёртка — обёртка распаковывается.** `==`, арифметика, тернарник, присваивание в `int`. Если обёртка `null` — NPE в строке, где `null` не видно.
- **Две обёртки через `==` — сравнение ссылок.** Кеш −128..127 делает его «рабочим» на тестах и ломает на реальных id. Обёртки сравнивают только `equals` или после явной распаковки.
- **`equals` обёрток сравнивает и тип, и значение.** `Long.equals(Integer)` — всегда `false`; а `contains`, `remove`, `Map.get` принимают `Object` и молча упаковывают `int` в `Integer`.
- **Обёртки неизменяемы.** `x++` для `Integer` — распаковать, прибавить, упаковать **новый** объект.

## Автораспаковка и NPE
- `int x = map.get(k)` при отсутствии ключа — NPE. Лечится `getOrDefault(k, 0)` или `merge(k, 1, Integer::sum)`.
- `count == null` безопасно (ссылка с `null`), `count == 0` при `null` — NPE.
- `Long x; long y;` → `x == y` сравнивает **значения**, не ссылки.
- Возврат `long` из метода, где в `return` попадает `Long null`, — NPE.

## Тернарный оператор
- Если один операнд `int`, другой `Integer` — тип выражения `int`. `Integer v = hit ? cached : 0` при `cached == null` — NPE, хотя слева `Integer`.
- Оба числовых операнда разных обёрток проходят численное расширение: `true ? Integer.valueOf(1) : Long.valueOf(2)` даёт `long`, и в `Object` попадёт `Long` `1`.
- Числовой и нечисловой операнд (`1` и `"x"`) — тип ссылочный, `1` просто упаковывается в `Integer`.
- Фикс: оба операнда ссылочные (`Integer.valueOf(0)`) или `Objects.requireNonNullElse(cached, 0)`.

## Разные типы обёрток
- `Long == Integer` (две ссылки) — не компилируется: `incomparable types`.
- `Long id; id == 1` компилируется: `id` распаковывается.
- `id.equals(1)` — `false`: `1` стал `Integer`.
- `Set<Long>.contains(intId)`, `Map<Long, User>.get(intId)` — всегда «не найдено». `javac` молчит, ловят IDE и Error Prone.
- `List<Integer>.remove(1)` удаляет по **индексу** (перегрузка `remove(int)`), по значению — `remove(Integer.valueOf(1))`.

## Кеш
- Упаковка идёт через `valueOf`. Гарантированно кешируются: `Integer`, `Long`, `Short`, `Byte` в −128..127, `Character` до `\u007f`, оба `Boolean`.
- `Integer a = 127, b = 127` → `a == b` — `true`; при 128 — `false`.
- `Double` и `Float` спецификация кешировать не обязывает, и OpenJDK не кеширует: `Double c = 1.0, d = 1.0` → `c == d` — `false`.
- Верхнюю границу кеша можно поднять **только у `Integer`**: `-XX:AutoBoxCacheMax=N` или `-Djava.lang.Integer.IntegerCache.high=N`. Тогда `==` на 1000 начнёт «работать» в одном окружении и не работать в другом.
- `new Integer(…)` — устарел к удалению (deprecated for removal с Java 16) и всегда создаёт новый объект.

## Неизменяемость
```java
Integer a = 128, c = a;
a++;            // a = Integer.valueOf(a.intValue() + 1)
// c — по-прежнему 128, a — новый объект 129
```
- Счётчик в `Map<String, Integer>` не увеличить через полученный объект — только `put`/`merge`/`compute`.
- В горячих циклах `Long sum += x` создаёт объект на каждой итерации — копить в `long`.
