// MIT — samgcoder. Standard WinForms application; no Browser86-specific APIs.
using System;
using System.Drawing;
using System.Windows.Forms;
using System.IO;

class ManagedForm : Form {
    private int clicks;
    private readonly Label label;
    private readonly TextBox input;
    public ManagedForm() {
        Text = "Browser86 - compiled .NET Framework WinForms";
        ClientSize = new Size(520, 320);
        label = new Label(); label.Text = "A real managed EXE, not a rewritten web app.";
        label.Location = new Point(20, 20); label.Size = new Size(470, 26); Controls.Add(label);
        input = new TextBox(); input.Text = "Hello from WinForms";
        input.Location = new Point(20, 60); input.Size = new Size(340, 26); Controls.Add(input);
        Button button = new Button(); button.Text = "Click and save";
        button.Location = new Point(20, 105); button.Size = new Size(150, 34);
        button.Click += OnClick; Controls.Add(button);
        Button close = new Button(); close.Text = "Close";
        close.Location = new Point(190, 105); close.Size = new Size(120, 34);
        close.Click += delegate { Close(); }; Controls.Add(close);
        Paint += OnPaint;
    }
    private void OnClick(object sender, EventArgs e) {
        clicks++;
        label.Text = "Clicks: " + clicks + " - " + input.Text;
        File.WriteAllText("winforms-result.txt", label.Text);
        Invalidate();
    }
    private void OnPaint(object sender, PaintEventArgs e) {
        using (SolidBrush brush = new SolidBrush(Color.FromArgb(30, 120, 200)))
            e.Graphics.FillRectangle(brush, 20, 180, 220 + clicks * 10, 65);
        using (Pen pen = new Pen(Color.Black, 2))
            e.Graphics.DrawEllipse(pen, 285, 178, 70, 70);
    }
    [STAThread]
    static void Main() {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new ManagedForm());
    }
}
