const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const startStr = '- 주해(Exegesis) vs 주입(Eisegesis): 설교자가 본문에서 의미를 이끌어내는가(Exegesis),';
const endStr = '- 사용자가 특정 질문이나 초점을 제공한 경우, 해당 부분을 우선적으로 분석하십시오.`,';

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr) + endStr.length;

if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
  const replacement = `- 주해(Exegesis) vs 주입(Eisegesis): 설교자가 본문에서 의미를 이끌어내는가(Exegesis), 아니면 자신의 생각을 본문에 주입하는가(Eisegesis)?
- 문법적-역사적 해석(Grammatical-Historical Method): 본문의 역사적 배경과 문법적 구조를 바르게 파악하고 있는가?
- 저자의 의도(Authorial Intent): 성령의 영감을 받은 원저자의 의도를 정확히 파악하고 전달하는가?
- 오직 성경(Sola Scriptura): 성경만이 최종 권위임을 인정하고, 인간의 철학이나 심리학, 세속적 지혜에 의존하지 않는가?

[강해설교 7가지 핵심 평가 기준]
1. 본문의 의미 설명 (Text-driven): 성경 본문의 원래 의미를 설명하고 있는가? ("나에게 무엇을 의미하냐"가 아닌 "하나님께 무엇을 의미하느냐"에 초점을 맞추었는가?)
2. 하나님의 권위 (God's authority): 본문을 충실히 설명하여 하나님의 권위를 드러내고 있는가, 아니면 설교자의 생각이나 철학으로 대체하였는가?
3. 설교자의 태도 (Preacher's attitude): 자기 이야기나 개인 경험 중심이 아닌가? (설교자가 주인공이 되는 교만을 경계하고 철저히 메신저로 숨어있는가?)
4. 그리스도의 주되심 (Christ's Lordship): 교회의 머리이신 그리스도의 음성이 선포되고 그리스도를 높이고 있는가?
5. 성령의 역사 (Holy Spirit's work): 감정 자극이나 사람의 반응을 유도하는 인위적인 방식을 취하지 않고, 오직 말씀을 통한 성령의 역사를 의지하는가?
6. 적용의 주체 (Subject of application): 설교자가 무리하게 구체적인 행동 지침을 강요하지 않고, 성경적 원리를 명확히 제시하여 성령께서 각 성도의 삶에 적용하시도록 돕고 있는가?
7. 예화 사용 (Use of illustrations): 개인 이야기 중심의 얄팍한 예화를 피하고, 성경으로 성경을 설명하거나 성경적(구약 등) 사건, 혹은 교회사적 사실을 예화로 활용하고 있는가?

[분석 지침 - 매우 중요]
- 상세 분석(detailedAnalysis) 작성 시, 위 7가지 원칙 각각에 대해 설교가 얼마나 잘 따르고 있는지 개별적으로 상세히 평가하십시오.
- 반드시 설교 텍스트의 특정 구절이나 문장을 직접 인용("...")하여 평가의 구체적인 근거로 제시하십시오. (예: "설교의 '...'라는 부분은 본문의 역사적 배경을 무시한 Eisegesis의 전형입니다.")
- 비판적인 부분(criticalPoints)을 지적할 때는, 해당 부분이 위 7가지 원칙 중 정확히 어떤 원칙을 위배했는지 명시적으로 연결하여 설명하십시오. (예: "[원칙 3 위배] 설교자의 개인적인 경험담이 너무 길게 제시됨")
- 어휘 및 어조, 대안 제안 등도 함께 종합하여 분석하십시오.
- 위 기준들을 바탕으로 설교가 성경 본문에 충실한지, 교리적으로 건전한지, 복음(그리스도)이 명확하게 선포되었는지 객관적이고 건설적으로 평가하되, 본문에서 벗어난 부분은 단호하게 비판하십시오.
- 사용자가 특정 질문이나 초점을 제공한 경우, 해당 부분을 우선적으로 분석하십시오.\`,`;

  content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
  fs.writeFileSync('src/App.tsx', content, 'utf8');
  console.log('Fixed successfully');
} else {
  console.log('Could not find start or end string');
}
