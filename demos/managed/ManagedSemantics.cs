// MIT — samgcoder. Standard Framework code; no Browser86-specific APIs.
using System;
using System.IO;
using System.Threading;
using System.Collections.Generic;
struct Pair {
    public int X;
    public Pair(int x) { X = x; }
    public void Add(int n) { X += n; }
}
class Initializer {
    public static int Value;
    static Initializer() { Value = 73; }
    public static int Read() { return Value; }
}
class ManagedSemantics {
    static int total;
    static string flow = "";
    static T Identity<T>(T value) { return value; }
    static int Twice(int n) { return n * 2; }
    static int Switch(int n) { switch (n) { case 0:return 11; case 1:return 22; case 2:return 33; case 3:return 44; default:return 99; } }
    static void Check(bool ok, string name) { if (!ok) throw new Exception("FAILED: " + name); total++; Console.WriteLine("PASS " + name); }
    static void Nested() {
        try { try { throw new InvalidOperationException("original"); }
              finally { flow += "inner;"; } }
        catch (InvalidOperationException) { flow += "catch;"; throw; }
        finally { flow += "outer;"; }
    }
    static int Main(string[] args) {
        if (args.Length > 0 && args[0] == "input") {
            Console.WriteLine("Enter text:"); string text = Console.ReadLine();
            File.WriteAllText("input.txt", text); Console.WriteLine("INPUT=" + text); return 0;
        }
        if (args.Length > 0 && args[0] == "unsupported") {
            new Thread(delegate() { Console.WriteLine("must not run"); }).Start(); return 0;
        }
        if (args.Length > 0 && args[0] == "loop") { while (true) { total++; } }
        Check(Identity<int>(42) == 42 && Identity<string>("generic") == "generic", "generic methods");
        Pair a = new Pair(8); Pair b = a; b.Add(3);
        Check(a.X == 8 && b.X == 11, "struct construction and value copies");
        Pair[] pairs = new Pair[2]; pairs[1] = b; pairs[1].Add(2);
        Check(pairs[1].X == 13 && b.X == 11, "struct array managed references");
        Func<int, int> fn = Twice; Check(fn(12) == 24, "delegate invocation");
        Check(Switch(0) == 11 && Switch(3) == 44 && Switch(20) == 99, "switch targets");
        int[] data = { 10, 20, 30, 40, 50, 60 };
        Check(data[5] == 60, "FieldRVA array initializer");
        Check(Initializer.Read() == 73, "static initialization before call");
        List<int> list = new List<int>(); list.Add(2); list.Add(3); int sum = 0;
        foreach (int value in list) sum += value;
        Check(sum == 5, "generic struct enumerator");
        double minus = Double.Parse("-1"), zero = Double.Parse("0");
        Check(minus < zero && !(minus > zero), "negative floating comparison");
        bool caught = false;
        try { Nested(); } catch (InvalidOperationException e) { caught = e.Message == "original"; }
        Check(caught && flow == "inner;catch;outer;", "nested finally and rethrow order");
        object valueBox = 2; Check(valueBox is int && !(valueBox is string), "runtime type tests");
        string[] words = new string[1]; object[] objects = words; caught = false;
        try { objects[0] = new object(); } catch (ArrayTypeMismatchException) { caught = true; }
        Check(caught, "reference array store type safety");
        Check(String.Format("{0:D4}:{1:X2}", 7, 255) == "0007:FF", "numeric composite formatting");
        Console.WriteLine("SEMANTICS=" + total);
        return 0;
    }
}
