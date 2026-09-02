const fs = require("fs");
let code = fs.readFileSync("views/home.ejs", "utf8");

let tableHtml = `    <!-- Schedule Table Start -->
    <div style="background-color: white; color: black; padding: 20px; border-radius: 8px; margin-bottom: 30px; font-family: Arial, sans-serif; overflow-x: auto;">
      <h3 style="text-align: center; font-weight: bold; margin-bottom: 15px; color: black; font-size: 24px;">❖ جدول الرحلات الأسبوعية :</h3>
      <table style="width: 100%; border-collapse: collapse; text-align: center; border: 2px solid black; direction: rtl; min-width: 700px;">
        <thead>
          <tr style="background-color: #8baee0; font-weight: bold; color: black;">
            <th style="border: 1px solid black; padding: 12px; width: 10%;">اليوم</th>
            <th style="border: 1px solid black; padding: 12px; width: 30%;">كلمات الصلاة</th>
            <th style="border: 1px solid black; padding: 12px; width: 30%;">الدورة</th>
            <th style="border: 1px solid black; padding: 12px; width: 20%;">الطبخ</th>
            <th style="border: 1px solid black; padding: 12px; width: 10%;">الاعلامي</th>
          </tr>
          <tr style="background-color: #8baee0; font-weight: bold; color: black;">
            <th style="border: 1px solid black; padding: 12px;"></th>
            <th style="border: 1px solid black; padding: 12px;">العنوان &ndash; الملقي</th>
            <th style="border: 1px solid black; padding: 12px;"></th>
            <th style="border: 1px solid black; padding: 12px;"></th>
            <th style="border: 1px solid black; padding: 12px;"></th>
          </tr>
        </thead>
        <tbody style="color: black; font-weight: bold; font-size: 18px;">
          <tr>
            <td style="border: 1px solid black; padding: 12px;">الخميس<br><span style="margin-top: 5px; display: inline-block;">3/21</span></td>
            <td style="border: 1px solid black; padding: 12px;"></td>
            <td style="border: 1px solid black; padding: 12px;">شرح<br>البرامج</td>
            <td style="border: 1px solid black; padding: 12px;">-</td>
            <td style="border: 1px solid black; padding: 12px;" rowspan="2"></td>
          </tr>
          <tr>
            <td style="border: 1px solid black; padding: 12px;">الخميس<br><span style="margin-top: 5px; display: inline-block;">3 - 28</span></td>
            <td style="border: 1px solid black; padding: 0;">
              <table style="width: 100%; height: 100%; border-collapse: collapse; margin: 0; background: transparent;">
                <tr>
                  <td style="width: 50%; border-left: 1px solid black; border-bottom: 1px solid black; padding: 12px;">عاصم<br>المهيزع</td>
                  <td style="width: 50%; border-bottom: 1px solid black; padding: 12px;">قصة موسى</td>
                </tr>
                <tr>
                  <td style="width: 50%; border-left: 1px solid black; padding: 12px;">بدر<br>الغدير</td>
                  <td style="width: 50%; padding: 12px;">قصة يوسف</td>
                </tr>
              </table>
            </td>
            <td style="border: 1px solid black; padding: 0;">
              <table style="width: 100%; height: 100%; border-collapse: collapse; margin: 0; background: transparent;">
                <tr>
                  <td style="width: 50%; border-left: 1px solid black; padding: 12px; vertical-align: middle;">الغاية من<br>الخلق</td>
                  <td style="width: 50%; padding: 12px; vertical-align: middle;">---</td>
                </tr>
              </table>
            </td>
            <td style="border: 1px solid black; padding: 12px;">مجموعة أبو<br>عبدالرحمن<br>السحيم</td>
          </tr>
        </tbody>
      </table>
    </div>
    <!-- Schedule Table End -->

`;

code = code.replace("<section class=\\"app - section active\\">", "<section class=\\"app - section active\\">\n\n" + tableHtml);

fs.writeFileSync("views/home.ejs", code);
console.log("Updated views/home.ejs");

