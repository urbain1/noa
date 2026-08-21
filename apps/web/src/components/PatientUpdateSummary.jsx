import { useState, useEffect, useMemo } from "react";

const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "Chinese (Simplified)",
  "Arabic",
  "Vietnamese",
  "Korean",
  "Russian",
  "Portuguese",
  "Haitian Creole",
];

const FOOTER_TRANSLATIONS = {
  "English": (name) => `\n\nQUESTIONS?\nIf you have questions about ${name}'s care, please ask your nurse or call the nurses' station.`,
  "Spanish": (name) => `\n\nPREGUNTAS?\nSi tiene preguntas sobre el cuidado de ${name}, por favor pregunte a su enfermera o llame a la estación de enfermería.`,
  "French": (name) => `\n\nQUESTIONS?\nSi vous avez des questions sur les soins de ${name}, veuillez demander à votre infirmière ou appeler le poste de soins infirmiers.`,
  "Chinese (Simplified)": (name) => `\n\n有问题吗？\n如果您对${name}的护理有任何疑问，请询问您的护士或致电护士站。`,
  "Arabic": (name) => `\n\nأسئلة؟\nإذا كانت لديك أسئلة حول رعاية ${name}، يرجى سؤال الممرضة أو الاتصال بمحطة التمريض.`,
  "Vietnamese": (name) => `\n\nCÂU HỎI?\nNếu bạn có câu hỏi về việc chăm sóc ${name}, vui lòng hỏi y tá hoặc gọi đến trạm y tá.`,
  "Korean": (name) => `\n\n질문이 있으신가요?\n${name}의 치료에 대해 궁금한 점이 있으시면 담당 간호사에게 문의하거나 간호사실로 전화해 주세요.`,
  "Russian": (name) => `\n\nВОПРОСЫ?\nЕсли у вас есть вопросы об уходе за ${name}, пожалуйста, обратитесь к медсестре или позвоните на пост медсестёр.`,
  "Portuguese": (name) => `\n\nPERGUNTAS?\nSe você tiver perguntas sobre o cuidado de ${name}, por favor pergunte à sua enfermeira ou ligue para o posto de enfermagem.`,
  "Haitian Creole": (name) => `\n\nKESYON?\nSi ou gen kesyon sou swen ${name}, tanpri mande enfimyè ou oswa rele estasyon enfimyè a.`,
};

export default function PatientUpdateSummary({ summaryText, patient, onClose, onRegenerate, onShare, isLoading }) {
  const [language, setLanguage] = useState("English");
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(summaryText);
  const [copied, setCopied] = useState(false);
  const [hasBeenEdited, setHasBeenEdited] = useState(false);
  const [includeFooter, setIncludeFooter] = useState(true);

  // Sync editedText when summaryText changes (after regeneration)
  useEffect(() => {
    setEditedText(summaryText);
    setIsEditing(false);
    setHasBeenEdited(false);
  }, [summaryText]);

  const generatedDate = useMemo(() => {
    const now = new Date();
    const date = now.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const time = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${date} at ${time}`;
  }, [summaryText]);

  const footerFn = FOOTER_TRANSLATIONS[language] || FOOTER_TRANSLATIONS["English"];
  const footerText = includeFooter ? footerFn(patient.name.split(" ")[0]) : "";

  const displayText = (isEditing ? editedText : editedText) + footerText;

  const handleCopy = () => {
    navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    onRegenerate(newLang, hasBeenEdited ? editedText : null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <button
          onClick={onClose}
          className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900"
          aria-label="Go back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
            <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
        </button>
        <h1 className="font-display text-xl font-bold tracking-tight text-gray-900">Patient Update</h1>
      </header>

      {/* Subheader */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="mx-auto max-w-2xl flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-500">Generated {generatedDate}</p>
            <span className="text-gray-300">|</span>
            <p className="text-xs text-gray-500">{patient.name}</p>
          </div>
          {/* Language selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Language:</label>
            <select
              value={language}
              onChange={handleLanguageChange}
              disabled={isLoading}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Body */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4 pb-48">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <svg className="h-8 w-8 animate-spin text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-gray-500">Generating update in {language}...</p>
          </div>
        ) : isEditing ? (
          <textarea
            value={editedText}
            onChange={(e) => {
      setEditedText(e.target.value);
      setHasBeenEdited(true);
    }}
            className="w-full min-h-[60vh] p-4 border border-gray-300 rounded-lg text-sm font-sans leading-relaxed focus:border-blue-500 focus:outline-none resize-none"
          />
        ) : (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">
              {displayText}
            </pre>
          </div>
        )}
      </main>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-2xl">
          {/* Footer toggle */}
          <div className="mb-3 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={includeFooter}
                onChange={(e) => setIncludeFooter(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Include &ldquo;Questions?&rdquo; contact footer
            </label>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleCopy}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97]"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={onShare}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.97]"
            >
              Share with Contacts
            </button>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 active:scale-[0.97]"
            >
              {isEditing ? "Done Editing" : "Edit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
