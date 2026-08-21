import { useState } from "react";
import AddContactForm from "./AddContactForm";

export default function ContactsDialog({ patient, onCancel, onAddContact, onEditContact, onDeleteContact }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState(null);

  const contacts = patient.contacts || [];

  const handleAddSave = (contactData) => {
    onAddContact(patient.id, contactData);
    setShowAddForm(false);
  };

  const handleEditSave = (contactData) => {
    onEditContact(patient.id, editingContactId, contactData);
    setEditingContactId(null);
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
        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Contacts</h2>
            <p className="text-sm text-gray-500">{patient.name} &middot; Room {patient.room}</p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-700"
            aria-label="Close"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 pb-4">
          {contacts.length === 0 && !showAddForm && (
            <p className="py-6 text-center text-sm text-gray-400 italic">No contacts added yet</p>
          )}

          <div className="flex flex-col gap-3">
            {contacts.map((contact) => (
              editingContactId === contact.id ? (
                <AddContactForm
                  key={contact.id}
                  existingContact={contact}
                  onSave={handleEditSave}
                  onCancel={() => setEditingContactId(null)}
                />
              ) : (
                <div key={contact.id} className="flex items-start justify-between rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-gray-900">{contact.name}</p>
                    <p className="text-xs text-gray-500">{contact.relationship} &middot; Prefers {methodLabel(contact.preferredMethod)}</p>
                    {contact.email && (
                      <p className="mt-1 text-xs text-gray-500">📧 {contact.email}</p>
                    )}
                    {contact.phone && (
                      <p className="text-xs text-gray-500">📱 {contact.phone}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setEditingContactId(contact.id)}
                      className="rounded p-1 text-gray-400 transition-colors hover:text-blue-500"
                      aria-label="Edit contact"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDeleteContact(patient.id, contact.id)}
                      className="rounded p-1 text-gray-400 transition-colors hover:text-red-500"
                      aria-label="Delete contact"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>

          {/* Add contact form */}
          {showAddForm && (
            <div className="mt-3">
              <AddContactForm
                onSave={handleAddSave}
                onCancel={() => setShowAddForm(false)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          {!showAddForm && editingContactId === null && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex-1 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 active:scale-[0.97]"
            >
              + Add Contact
            </button>
          )}
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 active:scale-[0.97]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
