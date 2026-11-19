## Главное в трёх правилах
- **`class` — объявление типа в коде, `Class` — объект в работающей JVM**, по одному на тип в пределах загрузчика. Поэтому объекты `Class` сравнивают через `==`.
- **`getClass()` — точный класс объекта в рантайме, `instanceof` — «является ли» с учётом иерархии.** Прокси и подклассы проходят `instanceof`, но не равенство классов.
- **Статический тип `x.getClass()` — `Class<? extends |T|>`, литерала `T.class` — `Class<T>`.** Дженерики инвариантны: неизвестный тип объявляют `Class<?>`, а не `Class<Object>` и не сырым `Class`.

## class и Class
- `class Dog {}` объявляет ссылочный тип. Объект `Class`, описывающий `Dog`, появляется, когда загрузчик загружает класс; экземпляры `Dog` создаёт `new`.
- `java.lang.Class<T>` — `final`-класс, `T` — описываемый тип. Суперкласс всех классов — `Object`, а не `Class`.
- Свои объекты `Class` есть у интерфейсов, enum, record, массивов (`int[].class`), примитивов (`int.class`) и `void` (`void.class`).
- `int.class != Integer.class`: примитив и обёртка — разные типы. `Integer.TYPE == int.class`. В рефлексии метод `foo(int)` ищут через `int.class`.
- Тип литерала примитива — класс обёртки: `int.class` — `Class<Integer>`, `void.class` — `Class<Void>`.
- `Class` одного имени, загруженный разными загрузчиками, — разные типы.

## Как получить Class
- Литерал: `Dog.class`, только после имени типа. `d.class` у переменной не компилируется — для объекта `d.getClass()`.
- `getClass()` у `null` — NPE, у примитива не вызывается вовсе.
- `Class.forName("com.acme.Dog")` — двоичное имя с пакетом, вложенный класс — `Outer$Inner`, массив — `"[I"`. Бросает checked `ClassNotFoundException`, возвращает `Class<?>`.
- Литерал `X.class` класс не инициализирует, `Class.forName(name)` — инициализирует; `forName(name, false, loader)` — загрузить без инициализации.
- Имена: `getName()` — `com.acme.Outer$Dog`, `[I`, `[Ljava.lang.String;`; `getSimpleName()` — `Dog`, у анонимного класса — пустая строка.

## Типы и дженерики
- `Dog dog` → `dog.getClass()` имеет тип `Class<? extends Dog>`: по ссылке может лежать наследник.
- `Class<Dog> c = dog.getClass()` не компилируется; нужен литерал `Dog.class`.
- `dog.getClass() == Dog.class` компилируется; `cat.getClass() == Dog.class` для несвязанного `Cat` — `incomparable types`.
- `Class<?>` принимает любой `Class<X>` и сохраняет проверки. `Class<Object> c = String.class` не компилируется.
- Сырой `Class` стирает **все** дженерики членов: `getAnnotation(Table.class)` возвращает просто `Annotation`, присвоить в `Table` без каста нельзя.

## getClass против instanceof
- `Animal a = new Dog()`: `a.getClass()` — `Dog`, `a.getClass() == Animal.class` — `false`, `a instanceof Animal` — `true`.
- `null instanceof X` — всегда `false`, без NPE. Отдельная проверка на `null` перед `instanceof` не нужна.
- Pattern matching: `if (o instanceof Dog d)` — проверка и приведение сразу.
- `instanceof` несовместимого типа (`String` против `Integer`) — ошибка компиляции.

## equals и прокси
- `getClass() != o.getClass()` в `equals` строго запрещает равенство с подклассами — сохраняет симметрию, но ломается на прокси.
- Ленивый прокси Hibernate — сгенерированный **подкласс** сущности. `getClass()` — `final`, вернёт класс прокси, и сущность «не равна» своему прокси.
- Для сущностей — `instanceof` и чтение полей через геттеры (у прокси поля не заполнены) или `Hibernate.getClass(o)`.

## Динамические проверки
- `A.isAssignableFrom(B)` — «в переменную типа `A` можно присвоить `B`?»: `Animal.class.isAssignableFrom(Dog.class)` — `true`, наоборот — `false`.
- `X.class.isInstance(o)` — динамический `instanceof`, на `null` — `false`.
- `X.class.cast(o)` — динамическое приведение: `ClassCastException` при несовпадении, `null` пропускает.
- Нужны, когда тип известен только в рантайме — в `Class<?>` переменной, а не в тексте кода.
