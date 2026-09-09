' MIT — samgcoder.
Imports System
Imports System.IO
Module ManagedVB
    Function Main() As Integer
        Dim sum As Integer = 0
        For i As Integer = 1 To 10
            sum += i
        Next
        Console.WriteLine("VB.NET running as compiled CIL")
        Console.WriteLine("SUM=" & sum.ToString())
        File.WriteAllText("vb-result.txt", "VB.NET sum=" & sum.ToString())
        Return 0
    End Function
End Module
