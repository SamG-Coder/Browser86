// MIT — samgcoder. Compile with the .NET Framework C# compiler; never substitute JS.
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

class Counter {
    public static int Seed = 7;
    public int Value;
    public Counter(int value) { Value = value; }
    public virtual int Next() { return ++Value; }
}
class DoubleCounter : Counter {
    public DoubleCounter(int value) : base(value) { }
    public override int Next() { Value += 2; return Value; }
}
class ManagedConsole {
    static int checks;
    [DllImport("kernel32.dll")] static extern uint GetCurrentProcessId();
    static void Check(bool ok, string label) {
        if (!ok) throw new Exception("FAILED: " + label);
        checks++;
        Console.WriteLine("PASS " + label);
    }
    static int Fib(int n) { return n < 2 ? n : Fib(n - 1) + Fib(n - 2); }
    static void Increment(ref int n) { n += 5; }
    static int FinallyValue() { try { return 9; } finally { Console.WriteLine("finally-return"); } }
    static void ThrowNested() { throw new InvalidOperationException("nested"); }
    static int Main(string[] args) {
        Console.WriteLine("Browser86 .NET Framework / compiled CIL");
        Check(Fib(10) == 55, "recursive calls");
        int sum = 0; for (int i = 0; i < 10; i++) sum += i;
        Check(sum == 45, "loop and branch");
        int high = Int32.MaxValue;
        Check(unchecked(high + 1) == Int32.MinValue, "int32 wrap");
        uint bits = 0x80000000U;
        Check((bits >> 31) == 1U, "unsigned shift");
        long wide = 9007199254740993L;
        Check(wide + 2 == 9007199254740995L, "exact int64");
        double d = 1.25; Check(d * 2 == 2.5, "double arithmetic");
        float f = 1.5f; Check(f * 2 == 3, "float arithmetic");
        int n = 2; Increment(ref n); Check(n == 7, "managed byref");
        int[] a = new int[4]; for (int i = 0; i < a.Length; i++) a[i] = i * i;
        Check(a[3] == 9 && a.Length == 4, "arrays");
        object boxed = n; Check((int)boxed == 7, "boxing");
        Counter c = new DoubleCounter(3);
        Check(c.Next() == 5 && Counter.Seed == 7, "virtual dispatch and static initializer");
        Check(" alpha ".Trim().ToUpperInvariant() == "ALPHA", "string methods");
        Check(String.Format("{0}:{1}", "value", 12) == "value:12", "string format");
        StringBuilder b = new StringBuilder(); b.Append("CIL").Append(':').Append(42);
        Check(b.ToString() == "CIL:42", "StringBuilder");
        List<int> list = new List<int>(); list.Add(3); list.Add(5);
        Check(list.Count == 2 && list[1] == 5, "generic List");
        Dictionary<string, int> map = new Dictionary<string, int>(); map.Add("answer", 42);
        Check(map.ContainsKey("answer") && map["answer"] == 42, "generic Dictionary");
        Check(Convert.ToInt32("123") == 123 && Int32.Parse("-4") == -4, "numeric parsing");
        Check(Math.Abs(-9) == 9 && Math.Sqrt(81) == 9, "Math");
        Directory.CreateDirectory("results");
        File.WriteAllText("results/managed.txt", "Hello from compiled .NET!");
        File.AppendAllText("results/managed.txt", "\nSaved in the virtual drive.");
        Check(File.Exists("results/managed.txt") && File.ReadAllText("results/managed.txt").Contains("virtual drive"), "virtual filesystem");
        Check(Path.GetFileName("C:/app/results/managed.txt") == "managed.txt", "Path");
        bool caught = false, finalized = false;
        try { ThrowNested(); }
        catch (InvalidOperationException e) { caught = e.Message == "nested"; }
        finally { finalized = true; }
        Check(caught && finalized, "cross-frame exception and finally");
        Check(FinallyValue() == 9, "return through finally");
        caught = false;
        try { int zero = args.Length - args.Length; n = 8 / zero; }
        catch (DivideByZeroException) { caught = true; }
        Check(caught, "divide by zero exception");
        caught = false;
        try { n = a[20]; } catch (IndexOutOfRangeException) { caught = true; }
        Check(caught, "array bounds exception");
        caught = false;
        try { n = checked(high + 1); } catch (OverflowException) { caught = true; }
        Check(caught, "checked integer overflow");
        Check(ManagedLibrary.Helpers.Square(7) == 49, "packaged assembly resolution");
        Check(args.Length == 2 && args[0] == "hello world" && args[1] == "second", "command line arguments");
        Check(GetCurrentProcessId() != 0, "PInvoke kernel32 bridge");
        Console.WriteLine("CHECKS=" + checks);
        return 0;
    }
}
