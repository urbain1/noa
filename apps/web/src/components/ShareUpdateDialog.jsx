import { useState } from "react";
import AddContactForm from "./AddContactForm";

export default function ShareUpdateDialog({ patient, onCancel, onSend, onAddContact }) {
  const contacts = patient.contacts || [];
  const [selectedIds, setSelectedIds] = useState(new Set(contacts.map((c) => c.id)));
  const [showAddForm, setShowAddForm] = useState(false);

  const toggleContact = (contactId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  };

  const handleSend = () => {
    const selected = contacts
      .filter((c) => selectedIds.has(c.id))
      .map((c) => ({ contact: c, method: c.preferredMethod }));
    onSend(selected);
  };

  const handleAddSave = (contactData) => {
    onAddContact(patient.id, contactData);
    setShowAddForm(false);
    // Note: the new contact will appear after parent re-renders with updated patient.
    // We can't select it here because we don't know its ID yet.
  };

  const methodIcon = (method) => {
    if (method === "text") return "📱";
    if (method === "both") return "📧📱";
    return "📧";
  };

  const methodLabel = (method) => {
    if (method === "both") return "Email & Text";
    if (method === "text") return "Text";
    return "Email";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-3">
          <h2 className="text-xl font-bold text-gray-900">Share Update</h2>
          <p className="mt-1 text-sm text-gray-500">{patient.name}&apos;s Contacts</p>
        </div>

        {/* Body */}
        <div className="max-h-[55vh] overflow-y-auto px-6 pb-2">
          {contacts.length === 0 && !showAddForm && (
            <p className="py-6 text-center text-sm text-gray-400 italic">
              No contacts added yet. Add a contact to share this update.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {contacts.map((contact) => (
              <label
                key={contact.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                  selectedIds.has(contact.id)
                    ? "border-blue-300 bg-blue-50"
                    : "border-gray-200 bg-gray-50 opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(contact.id)}
                  onChange={() => toggleContact(contact.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                  <p className="text-xs text-gray-500">{contact.relationship}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm">{methodIcon(contact.preferredMethod)}</p>
                  <p className="text-xs text-gray-500">{methodLabel(contact.preferredMethod)}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Add contact form */}
          {showAddForm ? (
            <div className="mt-3">
              <AddContactForm
                onSave={handleAddSave}
                onCancel={() => setShowAddForm(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-3 w-full rounded-lg border border-dashed border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:border-blue-300 hover:text-blue-600"
            >
              + Add Contact
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4">
          {/* HIPAA reminder */}
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-xs text-amber-800">
              Ensure patient has consented to sharing health information with selected contacts.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 active:scale-[0.97]"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={selectedIds.size === 0}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send to Selected ({selectedIds.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
