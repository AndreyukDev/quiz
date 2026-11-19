## Главное в пяти правилах
- **`finally` выполняется при любом выходе из `try`, а его собственный `return` или `throw` побеждает.** Результат `return` из `try` вычислен до `finally`; исключение из `try` при выходе из `finally` молча теряется.
- **try-with-resources закрывает в обратном порядке и ничего не теряет**: исключение из `close()` прикрепляется к основному как suppressed. Закрытие — до `catch` и `finally` самого оператора.
- **Ошибка статической инициализации ломает класс навсегда**: первый раз `ExceptionInInitializerError` (если брошено не `Error`), дальше — `NoClassDefFoundError`.
- **Checked-исключения проверяются по `throws` того метода, тело которого пишешь.** Для лямбды это метод функционального интерфейса, а не объемлющий метод.
- **Стектрейс в проде может исчезнуть**: HotSpot для часто бросаемых неявных исключений подставляет готовый экземпляр без стека.

## finally
- `return x` в `try` сохраняет значение `x`; изменение локальной переменной в `finally` результат не меняет. Изменение объекта по той же ссылке — видно.
- `return` в `finally` глушит исключение из `try`, `throw` в `finally` — заменяет его. Антипаттерн; `javac -Xlint:finally` предупреждает.
- `finally` не выполнится, если JVM остановилась: `System.exit`, `halt`, убитый процесс.

## try-with-resources
- Ресурс — `AutoCloseable`. С Java 9 можно указать готовую effectively final переменную: `try (res) { … }`.
- Ресурсы открываются по порядку. Упало открытие второго — тело не выполняется, первый закрывается, второй закрывать нечего.
- Тело и `close()` бросили оба — летит исключение тела, а исключение `close()` лежит в `getSuppressed()`.
- Ручной `try/finally { r.close(); }` делает наоборот: исключение `close()` затирает исходное — классические «потерянные» ошибки.
```java
try (var in = open("a"); var out = open("b")) {
    copy(in, out);
} // закроется out, потом in; затем catch/finally, если есть
```

## catch
- Блоки проверяются сверху вниз; `catch (IOException)` после `catch (Exception)` не компилируется: «has already been caught».
- `catch` checked-исключения, которое `try` бросить не может, — ошибка компиляции. `catch (Exception)` и `catch (Throwable)` можно всегда.
- Параметр multi-catch `catch (A | B e)` неявно `final`.
- Precise rethrow (Java 7): если параметр `catch` не переприсваивается, `throw e` бросает только те checked-исключения, которые реально может бросить `try`. Можно поймать `Exception`, залогировать и пробросить, оставив `throws IOException`. Переприсвоил `e` — компилятор потребует `throws Exception`.
- Оборачивая, передавайте причину: `new ServiceException("…", e)` — иначе корневой стек потерян.

## Checked-исключения и лямбды
- `files.forEach(p -> Files.readString(p))` не компилируется даже при `throws IOException` у метода: `Consumer.accept` checked-исключений не объявляет.
- Выходы: обычный цикл `for` (самый простой), `try/catch` внутри лямбды с `UncheckedIOException`, свой функциональный интерфейс с `throws`.

## Ошибки инициализации класса
- Исключение в `static`-инициализаторе — `ExceptionInInitializerError` с причиной внутри.
- Класс помечается ошибочным, повторная попытка сразу даёт `NoClassDefFoundError: Could not initialize class …`.
- В логах часто видна только NCDFE: ищите первое падение выше. С JDK 18 у NCDFE есть `cause` с текстом и стеком исходной ошибки, но не сам её объект.
- `NoClassDefFoundError` бывает и без статики — класса не было в рантайме, хотя при компиляции был.

## Исключения в проде
- `-XX:+OmitStackTraceInFastThrow` включён по умолчанию: после многих бросков в коде C2 NPE, `ArithmeticException`, `ArrayIndexOutOfBoundsException`, `ClassCastException` и др. летят без стека и сообщения.
- Что делать: искать первые вхождения после рестарта или запускать с `-XX:-OmitStackTraceInFastThrow`.
- Helpful NPE (JEP 358, по умолчанию с Java 15) добавляют сообщение `Cannot invoke … because … is null`, стек не трогают.
