## Главное в шести правилах
- **Дженерики инвариантны, массивы ковариантны.** `List<Integer>` не `List<Number>`, иначе через него добавили бы `Double`. Массив ту же дыру закрывает в рантайме (`ArrayStoreException`), дженерик — компилятором.
- **PECS: роль параметра решает wildcard.** Только отдаёт — `? extends T` (читать как `T`, писать только `null`). Только принимает — `? super T` (писать `T`, читать как `Object`). И то и другое — точный `T`.
- **Аргументы типа стираются.** `T` становится первой границей (без границы — `Object`), `List<String>` — `List`. Всё, что требует знать `T` в рантайме, не компилируется: `new T()`, `T.class`, `new T[n]`, `o instanceof List<String>`. Нужен тип в рантайме — передай `Class<T>` или `Supplier<T>`.
- **Стираются объекты и выражения, но не объявления.** Суперкласс, поля и сигнатуры методов хранят параметризованные типы (атрибут `Signature`), их читает рефлексия — на этом держатся type token и `getGenericType()`.
- **Unchecked-приведение и raw-тип ничего не проверяют.** Мусор попадает в коллекцию молча, а `ClassCastException` вылетает позже, там, где компилятор вставил `checkcast`, — далеко от виновника (heap pollution).
- **Гибкость — в параметрах, а не в возврате.** Wildcard в параметре расширяет круг аргументов незаметно для вызывающего; в возврате он достаётся каждому вызывающему. `<T>`, который встречается в сигнатуре один раз, заменяют на `?`.

## Вариантность
```java
List<Integer> ints = new ArrayList<>();
List<Number> a = ints;            // ошибка: инвариантность
List<? extends Number> b = ints;  // ок
Object[] d = new Integer[1];
d[0] = "x";                       // компилируется, ArrayStoreException
```
- Массивы ковариантны с Java 1.0, чтобы `sort(Object[])` работал с любым массивом ссылок. Цена — проверка типа при каждой записи в массив ссылок.
- `List<?>` — список неизвестного, но конкретного типа: принимает любой список, писать можно только `null`.
- Raw `List` выключает проверку: `add(42)` в чужой `List<String>` проходит с предупреждением `unchecked`. Raw-типы — только для совместимости с кодом до Java 5.

## PECS
```java
static <T> void copy(List<? super T> dst, List<? extends T> src)
```
- `copy(List<Number>, List<Integer>)` компилируется; с `List<T>` в обоих местах — нет, общего `T` не найти.
- `List<? extends Number>`: `add(1)` — ошибка (`int cannot be converted to CAP#1`), читать — как `Number`.
- `List<? super Integer>` принимает `List<Integer>`, `List<Number>`, `List<Object>`, но не `List<Long>`. Писать — `Integer`, читать — только `Object`. Компилятор смотрит на тип переменной, а не на реальный объект: `Double` в него не записать, даже если там `ArrayList<Number>`.
- Функции тоже: `Function<? super T, ? extends R>` у `Stream.map` — потребляет `T`, производит `R`. С `Function<T, R>` не пройдёт уже типизированная `Function<Object, Integer>`; лямбда и ссылка на метод подстраиваются и так.
- Компаратор потребляет: `Comparator<? super T>`, `<T extends Comparable<? super T>>`. `? super T` нужен, потому что `compareTo` часто объявлен в предке: `LocalDate` — это `Comparable<ChronoLocalDate>`.

## Захват wildcard
- Каждое использование `List<?>` получает свежий тип `CAP#n`, поэтому `list.set(i, list.get(j))` не компилируется: `CAP#1` и `CAP#2` не связаны.
- Лечится приватным helper-методом: публичная сигнатура остаётся с `?`, внутри захваченный тип получает имя.
```java
public static void swap(List<?> l, int i, int j) { swapHelper(l, i, j); }
private static <T> void swapHelper(List<T> l, int i, int j) {
    T t = l.get(i); l.set(i, l.get(j)); l.set(j, t);
}
```
- `"x".getClass()` имеет тип `Class<? extends String>`, даже у `final String`. В `<T> void p(T v, Class<T> c)` он не подходит; подходит литерал `String.class`.

## Стирание типов
- `T` стирается до **первой** границы: у `Box<T extends Comparable<T>>` поле `T value` в class-файле — `Comparable`, а `getGenericType()` вернёт `T`.
- `new ArrayList<String>().getClass() == new ArrayList<Integer>().getClass()` — `true`: объект `Class` один на класс. `List<String>.class` не существует.
- `o instanceof List<String>` из `Object` — ошибка (`cannot be safely cast`); `List<?>` — можно. С Java 16 разрешено, если приведение безопасно: `Collection<String> c; c instanceof List<String>`.
- Создавать можно только массивы реифицируемых типов: `new List<?>[n]` — да, `new List<String>[n]` и `new T[n]` — `generic array creation`. Обходы: `List<T>`, `Array.newInstance(type, n)`, `(T[]) new Object[n]` наружу не отдавать.
- Методы `m(List<String>)` и `m(List<Integer>)` в одном классе — `name clash: same erasure`, даже с разными типами возврата.
- Переопределение: `m(List)` переопределяет родительский `m(List<String>)` (подсигнатура = стирание), наоборот — name clash.
- Исключения: generic-подкласс `Throwable` и `catch (X e)` запрещены — `catch` сверяет класс в рантайме. `throws X` разрешён: это проверка компилятора (`Optional.orElseThrow`).
- Bridge-методы: `Money implements Comparable<Money>` получает синтетический `compareTo(Object)`, который приводит аргумент к `Money`. Через raw `Comparable` — `ClassCastException` в нём. В рефлексии отсеивают `Method.isBridge()`.

## Class<T> и type token
- `Class<T>` нужен, когда тип важен в рантайме: создать (`type.getDeclaredConstructor().newInstance()`), проверить (`isInstance`), привести (`cast`). Пример — `readValue(json, Dog.class)`.
- `(T) o` после стирания ничего не проверяет: `try { r.add((T) o); } catch (ClassCastException e)` не поймает ничего, в список попадёт всё.
- Super type token: `new TypeReference<List<User>>() {}` — анонимный **подкласс**, `getGenericSuperclass()` даёт `ParameterizedType` с `List<User>`. Без `{}` информации нет. Так работают Jackson `TypeReference` и Spring `ParameterizedTypeReference`.

## Heap pollution и varargs
```java
List<String> strings = new ArrayList<>();
List raw = strings;
raw.add(42);                  // проходит, unchecked
String s = strings.get(0);    // ClassCastException здесь
```
- Искать виновника помогает `Collections.checkedList(list, String.class)`: бросает исключение сразу при вставке.
- `T...` создаёт массив стёртого типа — javac предупреждает и в объявлении (`possible heap pollution`), и при вызове.
- `@SafeVarargs` — обещание автора, что метод не пишет в массив чужое и не отдаёт его наружу. Ничего не проверяет. Разрешена только на непереопределяемых: `static`, `final`, `private` (с 9) методах и конструкторах.

## Объявление и границы
- `T` класса не виден в `static`-методе: у `Box<String>` и `Box<Integer>` общий статический контекст. Статический метод объявляет свой `<T>`.
- Граница: `extends` + один класс (первым) + любые интерфейсы через `&`. `<T extends Comparable<T> & Number>` — `interface expected here`.
- `super` у параметра типа не бывает — только у wildcard.
- Явный аргумент типа — только с квалификатором: `Main.<String>print(x)`, `this.<String>m()`. `<String>print(x)` — синтаксическая ошибка.

## Рекурсивные границы
- `<B extends Builder<B>>` значит «мой собственный тип». Наследник подставляет себя, и унаследованные методы возвращают его тип:
```java
abstract class Builder<B extends Builder<B>> {
    String name;
    B name(String n) { this.name = n; return self(); }
    abstract B self();
}
class PizzaBuilder extends Builder<PizzaBuilder> { ... }
```
- `self()` вместо непроверяемого `(B) this`.
- `Enum<E extends Enum<E>>`: `compareTo(E)` сравнивает константы только одного enum — `Color.RED.compareTo(Size.S)` не компилируется; `getDeclaringClass()` — `Class<E>`.

## Вывод типов
- `var list = new ArrayList<>();` — выводить не из чего, получается `ArrayList<Object>`. `add(1)` и `add("a")` проходят, `String s = list.get(0)` — ошибка. Пиши `new ArrayList<String>()`.
- Diamond выводит тип из цели присваивания и из аргументов конструктора: `new ArrayList<>(List.of("a"))` даст `ArrayList<String>` и с `var`.
