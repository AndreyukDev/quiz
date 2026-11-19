## Главное в пяти правилах
- **`==` у ссылок — один ли это объект; `equals` — равно ли содержимое**, но только если класс его переопределил. Массивы, `StringBuilder` и классы без переопределения сравнивают ссылки и через `equals`.
- **`equals` и `hashCode` — парой, по одним полям.** Равные обязаны иметь равный хеш; хеш-коллекции сначала смотрят хеш, до `equals` без него не дойдёт.
- **`equals(Object)` с `@Override`**, до обращения к полям — `if (!(o instanceof T t)) return false`. Для `null` и чужого типа — `false`, не исключение.
- **Наследник с новым значимым полем ломает контракт `equals`.** Value-классы — `final` или `record`; расширять — композицией.
- **Поля, от которых зависит хеш, у ключа в `HashSet`/`HashMap` не меняют** — элемент станет ненаходимым.

## Контракт equals и hashCode
- `equals`: рефлексивность, симметричность, транзитивность, согласованность, `x.equals(null) == false`.
- `hashCode`: равные по `equals` → равные хеши. Обратного нет: одинаковый хеш у неравных — нормальная коллизия.
- Без `hashCode` берётся identity-хеш: два «равных» объекта почти всегда в разных бакетах, `HashSet` хранит дубль и не находит элемент. Баг ещё и плавающий — identity-хеши иногда совпадают.
- `HashMap` сравнивает сохранённый хеш узла до `equals`, так что даже общий бакет не спасает.
- Проще всего — `record` или `Objects.hash(...)` по тем же полям, что в `equals`.

## Как писать equals
```java
@Override
public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof Point p)) return false;   // отсекает и null
    return x == p.x && y == p.y;
}
@Override
public int hashCode() { return Objects.hash(x, y); }
```
- Каст без проверки: `(Dog) "x"` — `ClassCastException`, `(Dog) null` проходит, и NPE вылетает на поле.
- `equals(Point o)` — **перегрузка**, не переопределение: прямой вызов её выберет, коллекции вызовут `Object.equals`. `@Override` сразу дал бы ошибку компиляции.
- `double`-поля — `Double.compare(a, b) == 0`, не `==` (`NaN`, `-0.0`).
- Мутабельный ключ: положили в `HashSet`, поменяли поле — ни `contains(тот же объект)`, ни `contains(копия старого)` его не находят, хотя `size()` прежний.

## instanceof или getClass
- `instanceof` пускает наследника. Если наследник добавил поле в `equals` — `base.equals(sub)` = `true`, `sub.equals(base)` = `false`: симметрия сломана, `List.contains` зависит от порядка.
- `getClass() != o.getClass()` сохраняет контракт, но ломает подстановку: прокси Hibernate и Mockito, безобидные наследники больше не равны базовому.
- Практика: `final`-класс или `record` + `instanceof`; JPA-сущности — помнить о прокси.

## == для ссылок
- Приведение объект не копирует: `(Dog) animal == animal` — `true`.
- `==` компилируется, только если один тип приводим к другому: `Object` и `String` — да; несвязанные классы (`Long`/`Integer`, `Dog`/`Cat`) — `incomparable types`.
- Класс и интерфейс сравнимы, если класс не `final` (может быть наследник с интерфейсом): `ArrayList == Runnable` компилируется, `String == Runnable` — нет.

## null-безопасное сравнение
- `s.equals("X")` при `s == null` — NPE; `"X".equals(s)` и `Objects.equals(s, "X")` — `false`.
- `Objects.equals(a, b)` = `a == b || (a != null && a.equals(b))`: два `null` равны, но это всё тот же `equals` — `Objects.equals(1, 1L)` = `false`.

## Массивы и equals
- У массивов `equals`/`hashCode` от `Object`. По содержимому — `Arrays.equals`/`Arrays.hashCode`.
- Вложенные массивы — `Arrays.deepEquals`/`deepHashCode`/`deepToString`: `Arrays.equals` на `int[][]` сравнит внутренние массивы по ссылке.
- `Objects.equals` на массивах — ссылки; `Objects.deepEquals` — содержимое.
- Массив в `record` или как ключ `HashMap` — `equals` по ссылке. В `record` переопределять `equals`/`hashCode`/`toString` через `Arrays.*` или хранить `List.copyOf(...)` (заодно неизменяемость).
