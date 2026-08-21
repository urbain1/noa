import { useState } from "react";

export default function AddContactForm({ onSave, onCancel, existingContact = null }) {
  const [name, setName] = useState(existingContact?.name || "");
  const [relationship, setRelationship] = useState(existingContact?.relationship || "Other");
  const [phone, setPhone] = useState(existingContact?.phone || "");
  const [email, setEmail] = useState(existingContact?.email || "");
  const [preferredMethod, setPreferredMethod] = useState(existingContact?.preferredMethod || "email");

  const hasContactMethod = phone.trim() !== "" || email.trim() !== "";
  const isValid = name.trim() !== "" && hasContactMethod;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return;
    onSave({
      name: name.trim(),
      relationship,
      phone: phone.trim(),
      email: email.trim(),
      preferredMethod,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        {existingContact ? "Edit Contact" : "Add Contact"}
      </h3>

      <div className="flex flex-col gap-3">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Maria Johnson"
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Relationship */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Relationship</label>
          <select
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="Spouse">Spouse</option>
            <option value="Son">Son</option>
            <option value="Daughter">Daughter</option>
            <option value="Parent">Parent</option>
            <option value="Sibling">Sibling</option>
            <option value="Partner">Partner</option>
            <option value="Friend">Friend</option>
            <option value="Legal Guardian">Legal Guardian</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Phone */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555-0123"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {!hasContactMethod && name.trim() !== "" && (
          <p className="text-xs text-red-500">At least one contact method (phone or email) is required.</p>
        )}

        {/* Preferred method */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Preferred contact method</label>
          <div className="flex gap-2">
            {["email", "text", "both"].map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setPreferredMethod(method)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  preferredMethod === method
                    ? "bg-blue-100 text-blue-700 border border-blue-300"
                    : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                }`}
              >
                {method === "email" ? "Email" : method === "text" ? "Text" : "Both"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!isValid}
          className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {existingContact ? "Save Changes" : "Add Contact"}
        </button>
      </div>
    </form>
  );
}
