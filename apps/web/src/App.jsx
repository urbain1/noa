import { useState, useEffect } from "react";
import Dashboard from "./components/Dashboard";
import VoiceCapture from "./components/VoiceCapture";
import Alert from "./components/Alert";
import DischargeDialog from "./components/DischargeDialog";
import TaskEditDialog from "./components/TaskEditDialog";
import DeleteConfirmModal from "./components/DeleteConfirmModal";
import HandoffSummary from "./components/HandoffSummary";
import AddNoteDialog from "./components/AddNoteDialog";
import EditNoteDialog from "./components/EditNoteDialog";
import NoteDeleteConfirmModal from "./components/NoteDeleteConfirmModal";
import SuggestionModal from "./components/SuggestionModal";
import PatientUpdateSummary from "./components/PatientUpdateSummary";
import ShareUpdateDialog from "./components/ShareUpdateDialog";
import ContactsDialog from "./components/ContactsDialog";
import ChargeNurseDashboard from "./components/ChargeNurseDashboard";
import WelcomeScreen from "./components/WelcomeScreen";
import { parseTaskEditCommand, generateHandoffSummary, parseNoteEditCommand, generateSuggestions, generatePatientUpdate, translateText } from "./utils/claudeAPI";
import { patients as mockPatients } from "./mockData";

function App() {
  const [patients, setPatients] = useState(mockPatients);
  const [showVoice, setShowVoice] = useState(false);
  const [delayedTasks, setDelayedTasks] = useState([]);
  const [selectedPatientForDischarge, setSelectedPatientForDischarge] = useState(null);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [taskToEdit, setTaskToEdit] = useState(null);
  const [showHandoff, setShowHandoff] = useState(false);
  const [handoffData, setHandoffData] = useState(null);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [showAddNote, setShowAddNote] = useState(null); // patientId or null
  const [noteToEdit, setNoteToEdit] = useState(null); // { note, patientId } or null
  const [noteToDelete, setNoteToDelete] = useState(null); // { note, patientId } or null
  const [suggestionData, setSuggestionData] = useState(null); // { suggestions, patientId, patientName, triggerSummary } or null
  const [patientUpdateData, setPatientUpdateData] = useState(null); // { summaryText, patient } or null
  const [patientUpdateLoading, setPatientUpdateLoading] = useState(false);
  const [showShareUpdate, setShowShareUpdate] = useState(false);
  const [showContacts, setShowContacts] = useState(null); // patientId or null
  const [showChargeView, setShowChargeView] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [alertHidden, setAlertHidden] = useState(false);
  const [dismissedTaskIds, setDismissedTaskIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("dismissedTasks") || "[]");
    } catch {
      return [];
    }
  });

  // Simulate delayed status on mock tasks after 30 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setPatients((prev) =>
        prev.map((p) => ({
          ...p,
          tasks: p.tasks.map((t) =>
            (t.id === 9001 || t.id === 9002) && t.status === "Pending"
              ? { ...t, status: "Delayed" }
              : t
          ),
        }))
      );
    }, 30000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const delayed = [];
    for (const patient of patients) {
      for (const task of patient.tasks) {
        if (task.status === "Delayed" && !dismissedTaskIds.includes(task.id)) {
          delayed.push({ ...task, patientName: patient.name, patientRoom: patient.room });
        }
      }
    }
    setDelayedTasks(delayed);
  }, [patients, dismissedTaskIds]);

  const dismissAlert = (taskId) => {
    setDismissedTaskIds((prev) => {
      const updated = [...prev, taskId];
      localStorage.setItem("dismissedTasks", JSON.stringify(updated));
      return updated;
    });
  };

  const clearDismissed = () => {
    setDismissedTaskIds([]);
    localStorage.removeItem("dismissedTasks");
  };

  const handleFollowUp = (task) => {
    setPatients((prevPatients) =>
      prevPatients.map((patient) => ({
        ...patient,
        tasks: patient.tasks.map((t) =>
          t.id === task.id ? { ...t, status: "Confirmed" } : t
        ),
      }))
    );
    dismissAlert(task.id);
  };

  const simulateStatusChange = (taskId) => {
    setPatients((prev) =>
      prev.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => {
          if (t.id !== taskId) return t;
          // Don't touch completed tasks
          if (t.status === "Completed") return t;
          // If task is still Pending after 15s, simulate department confirmation
          if (t.status === "Pending") {
            return { ...t, status: "Confirmed" };
          }
          return t;
        }),
      }))
    );
  };

  const handleTaskCreated = (taskData) => {
    const newTask = {
      id: Date.now(),
      description: taskData.description,
      department: taskData.department,
      status: taskData.status || "Pending",
      priority: taskData.priority || "Routine",
      deadline: taskData.deadline || null,
      timestamp: new Date().toISOString(),
    };

    let targetPatientId = null;

    // Case 1: New patient being created
    if (taskData.isNewPatient) {
      const newPatientId = Date.now();
      const newPatient = {
        id: newPatientId,
        room: taskData.room,
        name: taskData.patientName || `Patient (Room ${taskData.room})`,
        age: taskData.patientAge || 0,
        comments: [],
        tasks: [newTask],
      };
      setPatients((prev) => [...prev, newPatient]);
      targetPatientId = newPatientId;
    } else {
      // Case 2: Add task to existing patient
      const roomExists = patients.find((p) => p.room === taskData.room);

      if (roomExists) {
        setPatients((prev) =>
          prev.map((p) =>
            p.room === taskData.room
              ? { ...p, tasks: [...p.tasks, newTask] }
              : p
          )
        );
        targetPatientId = roomExists.id;
      } else {
        // Create new patient card (unknown patient)
        const newPatientId = Date.now() + 1;
        const newPatient = {
          id: newPatientId,
          room: taskData.room,
          name: `Patient (Room ${taskData.room})`,
          age: 0,
          comments: [],
          tasks: [newTask],
        };
        setPatients((prev) => [...prev, newPatient]);
        targetPatientId = newPatientId;
      }
    }

    // Simulate status change after 15 seconds
    setTimeout(() => {
      simulateStatusChange(newTask.id);
    }, 15000);

    // Stat tasks that aren't confirmed within 45 seconds become delayed
    if (newTask.priority === "Stat") {
      setTimeout(() => {
        setPatients((prev) =>
          prev.map((p) => ({
            ...p,
            tasks: p.tasks.map((t) => {
              if (t.id !== newTask.id) return t;
              // Only delay if still just Confirmed (not Completed)
              if (t.status === "Confirmed") {
                return { ...t, status: "Delayed" };
              }
              return t;
            }),
          }))
        );
      }, 45000);
    }

    setShowVoice(false);

    // Trigger AI suggestions (async, non-blocking)
    if (targetPatientId) {
      triggerSuggestions(targetPatientId, {
        type: "task",
        data: newTask,
      });
    }
  };

  const handleDischargeClick = (patientId) => {
    const patient = patients.find((p) => p.id === patientId);
    if (patient) setSelectedPatientForDischarge(patient);
  };

  const handleDischargeConfirm = (options) => {
    const newTasks = [];

    if (options.notifyPatient) {
      newTasks.push({
        id: `discharge-notify-${Date.now()}`,
        description:
          "Notify patient about discharge plan" +
          (options.notes ? ` — ${options.notes}` : ""),
        department: "Nursing",
        priority: "Routine",
        status: "Pending",
        type: "discharge",
        timestamp: new Date().toISOString(),
      });
    }

    if (options.needsNursingHome) {
      newTasks.push({
        id: `discharge-nh-${Date.now()}`,
        description:
          "Arrange nursing home placement" +
          (!options.notifyPatient && options.notes ? ` — ${options.notes}` : ""),
        department: "Social Work",
        priority: "Urgent",
        status: "Pending",
        type: "discharge",
        timestamp: new Date().toISOString(),
      });
    }

    if (newTasks.length > 0) {
      setPatients((prev) =>
        prev.map((p) =>
          p.id === selectedPatientForDischarge.id
            ? { ...p, tasks: [...newTasks, ...p.tasks] }
            : p
        )
      );
    }

    setSelectedPatientForDischarge(null);
  };

  const handleDeleteClick = (task, patientId) => {
    setTaskToDelete({ task, patientId });
  };

  const handleDeleteConfirm = () => {
    if (!taskToDelete) return;

    setPatients((prevPatients) =>
      prevPatients.map((patient) => {
        if (patient.id === taskToDelete.patientId) {
          return {
            ...patient,
            tasks: patient.tasks.filter((t) => t.id !== taskToDelete.task.id),
          };
        }
        return patient;
      })
    );

    setTaskToDelete(null);
  };

  const handleDeleteCancel = () => {
    setTaskToDelete(null);
  };

  const handleEditClick = (task, patientId) => {
    setTaskToEdit({ task, patientId });
  };

  const handleEditUpdate = async (command, task, patientId) => {
    try {
      const result = await parseTaskEditCommand(command, task);

      if (result.action === "delete") {
        setTaskToEdit(null);
        setTaskToDelete({ task, patientId });
        return;
      }

      if (result.updates) {
        setPatients((prevPatients) =>
          prevPatients.map((patient) => {
            if (patient.id === patientId) {
              return {
                ...patient,
                tasks: patient.tasks.map((t) =>
                  t.id === task.id ? { ...t, ...result.updates } : t
                ),
              };
            }
            return patient;
          })
        );
        setTaskToEdit(null);
      }

      if (result.error) {
        alert(result.error);
      }
    } catch (error) {
      console.error("Edit error:", error);
      alert("Error updating task. Please try again.");
    }
  };

  const handleManualEditUpdate = (updates, task, patientId) => {
    setPatients((prevPatients) =>
      prevPatients.map((patient) => {
        if (patient.id === patientId) {
          return {
            ...patient,
            tasks: patient.tasks.map((t) =>
              t.id === task.id ? { ...t, ...updates } : t
            ),
          };
        }
        return patient;
      })
    );
    setTaskToEdit(null);
  };

  const handleEditCancel = () => {
    setTaskToEdit(null);
  };

  const handleGenerateShiftHandoff = async () => {
    setHandoffLoading(true);
    const result = await generateHandoffSummary(patients);
    if (result) {
      setHandoffData({ summaryText: result, title: "Shift Handoff Report", patientCount: patients.length });
      setShowHandoff(true);
    } else {
      alert("Failed to generate handoff summary. Please try again.");
    }
    setHandoffLoading(false);
  };

  const handleGeneratePatientHandoff = async (patientId) => {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;
    setHandoffLoading(true);
    const result = await generateHandoffSummary([patient]);
    if (result) {
      setHandoffData({ summaryText: result, title: `Handoff: ${patient.name}`, patientCount: 1 });
      setShowHandoff(true);
    } else {
      alert("Failed to generate handoff summary. Please try again.");
    }
    setHandoffLoading(false);
  };

  const handleCloseHandoff = () => {
    setShowHandoff(false);
    setHandoffData(null);
  };

  // --- Note handlers ---

  const handleAddNoteClick = (patientId) => {
    setShowAddNote(patientId);
  };

  const handleAddNoteSave = (noteData) => {
    if (showAddNote === null) return;
    const patientId = showAddNote;
    const newNote = {
      id: Date.now(),
      text: noteData.text,
      category: noteData.category,
      timestamp: new Date().toISOString(),
    };
    setPatients((prev) =>
      prev.map((p) =>
        p.id === patientId
          ? { ...p, comments: [...(p.comments || []), newNote] }
          : p
      )
    );
    setShowAddNote(null);

    // Trigger AI suggestions (async, non-blocking)
    triggerSuggestions(patientId, {
      type: "note",
      data: newNote,
    });
  };

  const handleEditNoteClick = (note, patientId) => {
    setNoteToEdit({ note, patientId });
  };

  const handleNoteAIUpdate = async (command, note, patientId) => {
    try {
      const result = await parseNoteEditCommand(command, note);

      if (result.action === "delete") {
        setNoteToEdit(null);
        setNoteToDelete({ note, patientId });
        return;
      }

      if (result.updates) {
        setPatients((prev) =>
          prev.map((p) => {
            if (p.id === patientId) {
              return {
                ...p,
                comments: (p.comments || []).map((n) =>
                  n.id === note.id ? { ...n, ...result.updates } : n
                ),
              };
            }
            return p;
          })
        );
        setNoteToEdit(null);
      }

      if (result.error) {
        alert(result.error);
      }
    } catch (error) {
      console.error("Note edit error:", error);
      alert("Error updating note. Please try again.");
    }
  };

  const handleNoteManualUpdate = (updates, note, patientId) => {
    setPatients((prev) =>
      prev.map((p) => {
        if (p.id === patientId) {
          return {
            ...p,
            comments: (p.comments || []).map((n) =>
              n.id === note.id ? { ...n, ...updates } : n
            ),
          };
        }
        return p;
      })
    );
    setNoteToEdit(null);
  };

  const handleDeleteNoteClick = (note, patientId) => {
    setNoteToDelete({ note, patientId });
  };

  const handleDeleteNoteConfirm = () => {
    if (!noteToDelete) return;
    setPatients((prev) =>
      prev.map((p) => {
        if (p.id === noteToDelete.patientId) {
          return {
            ...p,
            comments: (p.comments || []).filter((n) => n.id !== noteToDelete.note.id),
          };
        }
        return p;
      })
    );
    setNoteToDelete(null);
  };

  const handleDeleteNoteCancel = () => {
    setNoteToDelete(null);
  };

  // --- Suggestion handlers ---

  const handleSuggestionAddAsTask = (suggestion) => {
    if (!suggestionData) return;
    const patientId = suggestionData.patientId;
    const details = suggestion.taskDetails || {};
    const newTask = {
      id: Date.now(),
      description: details.description || suggestion.text,
      department: details.department || "Nursing",
      status: "Pending",
      priority: details.priority || "Routine",
      timestamp: new Date().toISOString(),
      deadline: details.deadline || null,
    };
    setPatients((prev) =>
      prev.map((p) =>
        p.id === patientId
          ? { ...p, tasks: [...p.tasks, newTask] }
          : p
      )
    );

    // Simulate status change after 15 seconds (same as regular task creation)
    setTimeout(() => {
      simulateStatusChange(newTask.id);
    }, 15000);
  };

  const handleSuggestionAddAsNote = (suggestion) => {
    if (!suggestionData) return;
    const patientId = suggestionData.patientId;
    const details = suggestion.noteDetails || {};
    const newNote = {
      id: Date.now(),
      text: details.text || suggestion.text,
      category: details.category || "Recommendation",
      timestamp: new Date().toISOString(),
    };
    setPatients((prev) =>
      prev.map((p) =>
        p.id === patientId
          ? { ...p, comments: [...(p.comments || []), newNote] }
          : p
      )
    );
  };

  const handleSuggestionDismissAll = () => {
    setSuggestionData(null);
  };

  // --- Patient Update handlers ---

  const handleGeneratePatientUpdate = async (patientId) => {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;
    setPatientUpdateLoading(true);
    try {
      const result = await generatePatientUpdate(patient, "English");
      if (result) {
        setPatientUpdateData({ summaryText: result, patient });
      } else {
        alert("Failed to generate patient update. Please try again.");
      }
    } catch (err) {
      console.error("Patient update error:", err);
      alert("Failed to generate patient update. Please try again.");
    }
    setPatientUpdateLoading(false);
  };

  const handleRegeneratePatientUpdate = async (language, editedText = null) => {
    if (!patientUpdateData) return;
    const patient = patients.find((p) => p.id === patientUpdateData.patient.id);
    if (!patient) return;
    setPatientUpdateLoading(true);
    try {
      let result;
      if (editedText) {
        // Nurse made edits: translate the edited text instead of regenerating
        result = await translateText(editedText, language);
      } else {
        // No edits: regenerate from patient data in the new language
        result = await generatePatientUpdate(patient, language);
      }
      if (result) {
        setPatientUpdateData({ summaryText: result, patient });
      } else {
        alert("Failed to regenerate update. Please try again.");
      }
    } catch (err) {
      console.error("Patient update regeneration error:", err);
      alert("Failed to regenerate update. Please try again.");
    }
    setPatientUpdateLoading(false);
  };

  const handleClosePatientUpdate = () => {
    setPatientUpdateData(null);
    setPatientUpdateLoading(false);
  };

  const handleShareUpdateSend = (recipients) => {
    // Simulated send
    setShowShareUpdate(false);
    // Show success message for each recipient
    const names = recipients.map((r) => r.contact.name).join(", ");
    alert(`Update sent to: ${names}`);
  };

  // --- Contact management handlers ---

  const handleShowContacts = (patientId) => {
    setShowContacts(patientId);
  };

  const handleAddContact = (patientId, contactData) => {
    const newContact = {
      id: Date.now(),
      ...contactData,
    };
    setPatients((prev) =>
      prev.map((p) =>
        p.id === patientId
          ? { ...p, contacts: [...(p.contacts || []), newContact] }
          : p
      )
    );
    // Also update patientUpdateData if it's for this patient
    if (patientUpdateData && patientUpdateData.patient.id === patientId) {
      setPatientUpdateData((prev) => ({
        ...prev,
        patient: {
          ...prev.patient,
          contacts: [...(prev.patient.contacts || []), newContact],
        },
      }));
    }
  };

  const handleEditContact = (patientId, contactId, contactData) => {
    setPatients((prev) =>
      prev.map((p) => {
        if (p.id === patientId) {
          return {
            ...p,
            contacts: (p.contacts || []).map((c) =>
              c.id === contactId ? { ...c, ...contactData } : c
            ),
          };
        }
        return p;
      })
    );
  };

  const handleDeleteContact = (patientId, contactId) => {
    setPatients((prev) =>
      prev.map((p) => {
        if (p.id === patientId) {
          return {
            ...p,
            contacts: (p.contacts || []).filter((c) => c.id !== contactId),
          };
        }
        return p;
      })
    );
  };

  // --- Charge Nurse Dashboard handlers ---

  const handleSwitchToChargeView = () => {
    setShowChargeView(true);
  };

  const handleSwitchToMyPatients = () => {
    setShowChargeView(false);
  };

  const handleChargePatientClick = (patientId) => {
    setShowChargeView(false);
    // Scroll to patient card would happen here in a real app
  };

  // --- Alert escalation handlers ---

  const handleRepageDepartment = (task) => {
    // Simulate repaging: reset the task's delayed status back to Pending
    // and restart the status simulation timer
    setPatients((prev) =>
      prev.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) =>
          t.id === task.id ? { ...t, status: "Pending" } : t
        ),
      }))
    );
    // Simulate a new status change after 15 seconds
    setTimeout(() => {
      simulateStatusChange(task.id);
    }, 15000);
  };

  const handleEscalateToCharge = (task) => {
    // Escalate: change priority to Stat and add escalated flag
    setPatients((prev) =>
      prev.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) =>
          t.id === task.id ? { ...t, priority: "Stat", escalated: true } : t
        ),
      }))
    );
  };

  const triggerSuggestions = async (patientId, newItem) => {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;

    try {
      const suggestions = await generateSuggestions(patient, newItem);
      if (suggestions && suggestions.length > 0) {
        const triggerSummary = newItem.type === "task"
          ? `New task: ${newItem.data.description}`
          : `New note: ${newItem.data.text.slice(0, 50)}${newItem.data.text.length > 50 ? "..." : ""}`;
        setSuggestionData({
          suggestions,
          patientId,
          patientName: patient.name,
          triggerSummary,
        });
      }
    } catch (err) {
      console.error("Suggestion generation failed:", err);
      // Silently fail - suggestions are non-critical
    }
  };

  if (showWelcome) {
    return <WelcomeScreen onStart={() => setShowWelcome(false)} />;
  }

  if (showChargeView) {
    return (
      <>
        <ChargeNurseDashboard
          patients={patients}
          onSwitchView={handleSwitchToMyPatients}
          onPatientClick={handleChargePatientClick}
          delayedTasks={delayedTasks}
          onGenerateHandoff={handleGenerateShiftHandoff}
          onDischargePatient={(patient) => setSelectedPatientForDischarge(patient)}
          onFollowUp={handleFollowUp}
          onDismissAlert={dismissAlert}
        />
        {/* Keep alert visible on charge view */}
        {delayedTasks.length > 0 && !alertHidden && (
          <Alert
            task={delayedTasks[0]}
            onRepage={handleRepageDepartment}
            onEscalate={handleEscalateToCharge}
            onDismiss={() => setAlertHidden(true)}
            currentIndex={0}
            totalCount={delayedTasks.length}
          />
        )}
      </>
    );
  }

  if (patientUpdateData && !showShareUpdate) {
    const currentPatient = patients.find((p) => p.id === patientUpdateData.patient.id) || patientUpdateData.patient;
    return (
      <>
        <PatientUpdateSummary
          summaryText={patientUpdateData.summaryText}
          patient={currentPatient}
          onClose={handleClosePatientUpdate}
          onRegenerate={handleRegeneratePatientUpdate}
          onShare={() => setShowShareUpdate(true)}
          isLoading={patientUpdateLoading}
        />
      </>
    );
  }

  if (patientUpdateData && showShareUpdate) {
    const currentPatient = patients.find((p) => p.id === patientUpdateData.patient.id) || patientUpdateData.patient;
    return (
      <>
        <PatientUpdateSummary
          summaryText={patientUpdateData.summaryText}
          patient={currentPatient}
          onClose={handleClosePatientUpdate}
          onRegenerate={handleRegeneratePatientUpdate}
          onShare={() => setShowShareUpdate(true)}
          isLoading={patientUpdateLoading}
        />
        <ShareUpdateDialog
          patient={currentPatient}
          onCancel={() => setShowShareUpdate(false)}
          onSend={handleShareUpdateSend}
          onAddContact={handleAddContact}
        />
      </>
    );
  }

  if (showHandoff && handoffData) {
    return (
      <HandoffSummary
        summaryText={handoffData.summaryText}
        title={handoffData.title}
        patientCount={handoffData.patientCount}
        onClose={handleCloseHandoff}
      />
    );
  }

  if (showVoice) {
    return (
      <VoiceCapture
        onClose={() => setShowVoice(false)}
        onTaskCreated={handleTaskCreated}
        allPatients={patients}
      />
    );
  }

  return (
    <>
      {delayedTasks.length > 0 && !showVoice && !alertHidden && (
        <Alert
          task={delayedTasks[0]}
          onDismiss={() => setAlertHidden(true)}
          onRepage={handleRepageDepartment}
          onEscalate={handleEscalateToCharge}
          currentIndex={0}
          totalCount={delayedTasks.length}
        />
      )}
      <Dashboard
        patients={patients}
        onVoiceClick={() => setShowVoice(true)}
        dismissedCount={dismissedTaskIds.length}
        onClearDismissed={clearDismissed}
        onDischargeClick={handleDischargeClick}
        onDeleteTask={handleDeleteClick}
        onEditTask={handleEditClick}
        onGenerateHandoff={handleGenerateShiftHandoff}
        onPatientHandoff={handleGeneratePatientHandoff}
        handoffLoading={handoffLoading}
        onAddNote={handleAddNoteClick}
        onEditNote={handleEditNoteClick}
        onDeleteNote={handleDeleteNoteClick}
        onGeneratePatientUpdate={handleGeneratePatientUpdate}
        onShowContacts={handleShowContacts}
        patientUpdateLoading={patientUpdateLoading}
        onSwitchToChargeView={handleSwitchToChargeView}
        delayedTasks={delayedTasks}
        onDischargePatient={(patient) => setSelectedPatientForDischarge(patient)}
        onFollowUp={handleFollowUp}
        onDismissAlert={dismissAlert}
        onOpenVoiceCapture={() => setShowVoice(true)}
      />
      {selectedPatientForDischarge && (
        <DischargeDialog
          patient={selectedPatientForDischarge}
          onCancel={() => setSelectedPatientForDischarge(null)}
          onConfirm={handleDischargeConfirm}
        />
      )}
      {taskToDelete && (
        <DeleteConfirmModal
          task={taskToDelete.task}
          onCancel={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
        />
      )}
      {taskToEdit && (
        <TaskEditDialog
          task={taskToEdit.task}
          patientId={taskToEdit.patientId}
          onCancel={handleEditCancel}
          onUpdate={handleEditUpdate}
          onManualUpdate={handleManualEditUpdate}
          allPatients={patients}
        />
      )}
      {showAddNote !== null && (
        <AddNoteDialog
          patientName={(patients.find((p) => p.id === showAddNote)?.name) || "Patient"}
          onCancel={() => setShowAddNote(null)}
          onSave={handleAddNoteSave}
        />
      )}
      {noteToEdit && (
        <EditNoteDialog
          note={noteToEdit.note}
          patientId={noteToEdit.patientId}
          onCancel={() => setNoteToEdit(null)}
          onAIUpdate={handleNoteAIUpdate}
          onManualUpdate={handleNoteManualUpdate}
        />
      )}
      {noteToDelete && (
        <NoteDeleteConfirmModal
          note={noteToDelete.note}
          onCancel={handleDeleteNoteCancel}
          onConfirm={handleDeleteNoteConfirm}
        />
      )}
      {suggestionData && (
        <SuggestionModal
          suggestions={suggestionData.suggestions}
          patientName={suggestionData.patientName}
          triggerSummary={suggestionData.triggerSummary}
          onAddAsTask={handleSuggestionAddAsTask}
          onAddAsNote={handleSuggestionAddAsNote}
          onDismissAll={handleSuggestionDismissAll}
        />
      )}
      {showContacts !== null && (
        <ContactsDialog
          patient={patients.find((p) => p.id === showContacts) || { id: showContacts, name: "Patient", contacts: [] }}
          onCancel={() => setShowContacts(null)}
          onAddContact={handleAddContact}
          onEditContact={handleEditContact}
          onDeleteContact={handleDeleteContact}
        />
      )}
    </>
  );
}

export default App;
