const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const startStr = `  const handleSubscribe = async () => {
    if (!currentUser) return;
    
    try {
      setIsLoading(true);
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: currentUser.uid,
          email: currentUser.email,
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });`;

const endStr = `        timestamp: Date.now(),
        metadata: { name: preacherName.trim(), date: sermonDate, passage: biblePassage.trim() },
        sermonText,
        specificRequest,
        analysisResult: parsed
      };
      setHistory(prev => {
        const updated = [newHistoryItem, ...prev].slice(0, 50);
        localStorage.setItem('sermon_history', JSON.stringify(updated));
        return updated;
      });

    } catch (err: any) {
      console.error('Error analyzing sermon:', err);
      setError(err.message || '분석 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };`;

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr) + endStr.length;

if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
  const replacement = `  const handleSubscribe = async () => {
    if (!currentUser) return;
    
    try {
      setIsLoading(true);
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: currentUser.uid,
          email: currentUser.email,
        }),
      });
      
      const data = await response.json();
      if (data.url) {
        // iframe 내부에서 실행 중인지 확인
        if (window.self !== window.top) {
          // iframe 내부라면 새 창으로 열기 (팝업 차단 우회)
          const newWindow = window.open(data.url, '_blank');
          if (!newWindow) {
            setAlertMessage('팝업이 차단되었습니다. 팝업 차단을 해제하거나, 우측 상단의 "새 탭에서 열기" 버튼을 눌러 앱을 새 창에서 실행한 후 다시 시도해주세요.');
          } else {
            setAlertMessage('새 창에서 결제 페이지가 열렸습니다. 결제가 완료되면 이 창을 새로고침 해주세요.');
          }
        } else {
          // 독립된 창이라면 바로 이동
          window.location.href = data.url;
        }
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (error: any) {
      console.error('Subscription error:', error);
      setAlertMessage(\`결제 페이지로 이동하는 중 오류가 발생했습니다: \${error.message}\`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!currentUser) return;
    
    try {
      setIsLoading(true);
      const response = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: currentUser.email,
        }),
      });
      
      const data = await response.json();
      if (data.url) {
        if (window.self !== window.top) {
          window.open(data.url, '_blank');
        } else {
          window.location.href = data.url;
        }
      } else {
        throw new Error(data.error || 'Failed to create portal session');
      }
    } catch (error: any) {
      console.error('Portal error:', error);
      setAlertMessage(\`구독 관리 페이지로 이동하는 중 오류가 발생했습니다: \${error.message}\`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!currentUser) {
      signInWithPopup(auth, googleProvider);
      return;
    }

    if (!isSubscribed) {
      handleSubscribe();
      return;
    }

    if (!sermonText.trim()) {
      setError('설교 전문을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError('');
    setAnalysisResult(null);
    setAnalyzedMetadata({ 
      name: preacherName.trim(), 
      role: preacherRole.trim(),
      date: sermonDate, 
      passage: biblePassage.trim(),
      title: sermonTitle.trim()
    });

    try {
      let prompt = '';
      if (sermonTitle.trim()) prompt += \`설교 제목: \${sermonTitle.trim()}\\n\`;
      prompt += \`설교자: \${preacherName.trim()} \${preacherRole.trim()}\\n\`;
      prompt += \`설교 일자: \${sermonDate}\\n\`;
      prompt += \`본문: \${biblePassage}\\n\`;
      prompt += \`사용자 요청사항: \${specificRequest}\\n\\n\`;
      prompt += \`[설교 전문]\\n\${sermonText}\\n\`;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          systemInstruction: \`당신은 기독교 강해설교 분야, 특히 존 맥아더(John MacArthur) 목사님의 강해설교 원리와 개혁주의 신학에 대한 심층적인 지식을 갖춘 최고 수준의 설교 분석 전문가입니다. 
당신은 수많은 정통 신학 서적(예: 마틴 로이드 존스의 '설교와 설교자', 존 스토트의 '두 세계 사이에서', 존 맥아더의 '강해설교 재발견' 등)과 강해설교 방법론을 깊이 학습한 상태입니다.
제공된 설교 텍스트를 다음의 '존 맥아더 신학 마스터 클래스: 강해설교' 핵심 7가지 원칙과 성경 해석학적 방법론에 기반하여 매우 엄격하고 심층적으로 분석하고 평가하십시오.

[신학적 전제 및 해석학적 방법론 (Theological & Hermeneutical Framework)]
- 주해(Exegesis) vs 주입(Eisegesis): 설교자가 본문에서 의미를 이끌어내는가(Exegesis), 아니면 자신의 생각을 본문에 주입하는가(Eisegesis)?
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
- 사용자가 특정 질문이나 초점을 제공한 경우, 해당 부분을 우선적으로 분석하십시오.\`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING, description: "강해설교 원칙에 비추어 본 설교 핵심 요약" },
              outline: { 
                type: Type.ARRAY, 
                description: "설교의 논리적 흐름에 따른 개요(서론, 본론 대지, 결론 등)",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    point: { type: Type.STRING, description: "대지 제목 (예: 서론, 1. 첫 번째 대지, 결론 등)" },
                    details: { type: Type.ARRAY, items: { type: Type.STRING }, description: "해당 대지의 핵심 내용 요약" }
                  },
                  required: ["point", "details"]
                }
              },
              toneAnalysis: { type: Type.STRING, description: "어휘 및 어조 분석 (너무 어려운 신학 용어 남발, 혹은 너무 가벼운 유머 위주의 어조인지 평가)" },
              improvementSuggestion: {
                type: Type.OBJECT,
                description: "본문에서 벗어났거나 인간 중심적으로 흐른 문단을 성경 중심적으로 다시 쓴 모범 수정안",
                properties: {
                  needed: { type: Type.BOOLEAN, description: "수정이 필요한 문단이 있는지 여부" },
                  original: { type: Type.STRING, description: "원문 문단 (수정이 필요한 부분)" },
                  improved: { type: Type.STRING, description: "성경 중심적으로 개선된 모범 수정안" },
                  reason: { type: Type.STRING, description: "수정 이유 (반드시 1~2문장으로 아주 간결하게 핵심만 작성할 것. 시스템 메시지, 부연 설명, 괄호 코멘트 등을 절대 포함하지 말 것)" }
                },
                required: ["needed"]
              },
              positivePoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "강해설교 원칙에 부합하는 긍정적인 평가 부분들 (명확하고 간결한 문장으로 작성)" },
              criticalPoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "강해설교 원칙에 어긋나거나 개선이 필요한 비판적인 평가 부분들. 어떤 원칙을 위배했는지 명시적으로 포함하여 작성 (예: '[원칙 7 위배] 개인적인 예화가 너무 긺')" },
              detailedAnalysis: { type: Type.STRING, description: "7가지 핵심 원칙 각각에 대한 심층적이고 상세한 분석 및 평가. 반드시 설교 본문의 특정 구절을 직접 인용하여 근거로 제시할 것 (마크다운 포맷)" }
            },
            required: ["summary", "outline", "toneAnalysis", "improvementSuggestion", "positivePoints", "criticalPoints", "detailedAnalysis"]
          }
        }
      });
      
      const jsonStr = response.text;
      if (!jsonStr) throw new Error("No response from AI");
      
      const parsed = JSON.parse(jsonStr) as AnalysisData;
      setAnalysisResult(parsed);

      const newHistoryItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        metadata: { name: preacherName.trim(), date: sermonDate, passage: biblePassage.trim() },
        sermonText,
        specificRequest,
        analysisResult: parsed
      };
      setHistory(prev => {
        const updated = [newHistoryItem, ...prev].slice(0, 50);
        localStorage.setItem('sermon_history', JSON.stringify(updated));
        return updated;
      });

    } catch (err: any) {
      console.error('Error analyzing sermon:', err);
      setError(err.message || '분석 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };`;

  content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
  fs.writeFileSync('src/App.tsx', content, 'utf8');
  console.log('Fixed successfully');
} else {
  console.log('Could not find start or end string', startIndex, endIndex);
}
