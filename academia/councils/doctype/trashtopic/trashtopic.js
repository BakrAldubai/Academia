// // Copyright (c) 2024, SanU and contributors
// // For license information, please see license.txt

frappe.ui.form.on("trashTopic", {
	refresh(frm) {
		// Add a custom button to assign the topic to a council
		if (
			frm.doc.__onload &&
			frm.doc.__onload.has_topic_assignment != false &&
			frm.doc.docstatus === 1
		) {
			frm.add_custom_button(__("Assign to Council"), function () {
				frappe.new_doc("trashTopic Assignment", {
					topic: frm.doc.name,
					title: frm.doc.title,
					descripition: frm.doc.descripition,
					council: frm.doc.council,
				});
			});
		}

		if (!frm.is_new()) {
			// Render the list view
			show_related_assignments(frm);
		}

		frm.add_custom_button(
			__("Select Applicants"),
			function () {
				show_applicant_selector(frm);
			},
			__("Get Applicants")
		);
	},
	topic_main_category(frm) {
		// Update the options for the sub-category field based on the selected main category
		frm.set_query("topic_sub_category", function () {
			return {
				filters: {
					main_category: frm.doc.topic_main_category,
				},
			};
		});
	},
});

frappe.ui.form.on("trashTopic Applicant", {
	applicant: function (frm, cdt, cdn) {
		// Retrieve and update form with the applicant name
		let topic_applicant = frappe.get_doc(cdt, cdn);

		if (topic_applicant.applicant) {
			// Attempt to check for duplicates after ensuring applicant list is updated
			try {
				check_for_duplicate_applicant(frm, cdt, cdn);
			} catch (error) {
				frappe.msgprint(__("Failed to verify duplicate applicants: " + error.message));
			}
		}
		if (topic_applicant.applicant) {
			populate_applicant_full_name(cdt, cdn, topic_applicant);
		}
	},
	applicant_type: function (frm, cdt, cdn) {
		frappe.model.set_value(cdt, cdn, "applicant", "");
		frappe.model.set_value(cdt, cdn, "applicant_name", "");
	},
});

/**
 * Checks for duplicate applicants
 * to ensure that there are no duplicate entries with the same applicant and applicant type.
 * If a duplicate is found, it clears the duplicate applicant fields and displays a message.
 *
 * @param {object} frm - The current form object.
 * @param {string} cdt - The child doctype (child table name).
 * @param {string} cdn - The name of the child doctype record (unique identifier for the row).
 */
function check_for_duplicate_applicant(frm, cdt, cdn) {
	var row = locals[cdt][cdn]; // Access the specific row in the child table using the locals object.
	// Filter the child table rows to find any other rows with the same applicant and applicant type.
	var duplicates = frm.doc.applicants.filter(function (d) {
		return (
			d.applicant === row.applicant &&
			d.applicant_type === row.applicant_type &&
			d.name !== row.name
		);
	});
	// If duplicates are found, display a message and clear the fields to correct the entry.
	if (duplicates.length > 0) {
		frappe.msgprint(
			__("Duplicate entry for Applicant: {0} of Type: {1}", [
				row.applicant,
				row.applicant_type,
			])
		);
		frappe.model.set_value(cdt, cdn, "applicant_name", ""); // Additionally, clear the duplicate applicant name field.
		frappe.model.set_value(cdt, cdn, "applicant", ""); // Clear the duplicate applicant ID field.
	}
}

function populate_applicant_full_name(cdt, cdn, applicant) {
	//use mapping because it is dynamic link with different name fields names
	const name_fields_mapping = {
		Student: ["first_name", "last_name"],
		"Faculty Member": ["faculty_member_name"],
		Employee: ["employee_name"],
	};
	// Get the name fields for the current applicant type
	const name_fields = name_fields_mapping[applicant.applicant_type];
	if (!name_fields) {
		frappe.model.set_value(cdt, cdn, "applicant_name", "Name Not Set");
		return;
	}
	frappe.db
		.get_value(applicant.applicant_type, { name: applicant.applicant }, name_fields)
		.then(function (values) {
			if (values) {
				let applicant_full_name = "Name Not Set";
				if (applicant.applicant_type === "Student") {
					applicant_full_name =
						(values.message.first_name || "") + " " + (values.message.last_name || "");
				} else {
					for (const field of name_fields) {
						if (values.message[field]) {
							applicant_full_name = values.message[field];
							break;
						}
					}
				}
				// Set the value of the 'applicant_name' field
				frappe.model.set_value(cdt, cdn, "applicant_name", applicant_full_name.trim());
			}
		});
}

function show_applicant_selector(frm) {
	let applicant_type_dialog = new frappe.ui.Dialog({
		title: __("Select Applicant Type"),
		fields: [
			{
				fieldname: "applicant_type",
				label: __("Applicant Type"),
				fieldtype: "Select",
				options: ["Student", "Faculty Member", "Other"],
				reqd: 1,
			},
		],
		primary_action_label: __("Continue"),
		primary_action(values) {
			applicant_type_dialog.hide();
			open_multiselect_dialog(frm, values.applicant_type);
		},
	});

	applicant_type_dialog.show();
}

function open_multiselect_dialog(frm, applicant_type) {
	let opts = get_applicant_type_info(frm, applicant_type);

	const d = new frappe.ui.form.MultiSelectDialog({
		doctype: opts.source_doctype,
		target: opts.target,
		date_field: opts.date_field || undefined,
		setters: opts.setters,
		data_fields: opts.data_fields,
		get_query: opts.get_query,
		add_filters_group: 1,
		allow_child_item_selection: opts.allow_child_item_selection,
		child_fieldname: opts.child_fieldname,
		child_columns: opts.child_columns,
		size: opts.size,
		action: function (selections) {
			let values = selections;
			if (values.length === 0) {
				frappe.msgprint(__("Please select {0}", [opts.source_doctype]));
				return;
			}
			// console.log("Selections:", values);
			d.dialog.hide();
			add_applicants_to_topic(frm, values, opts.source_doctype);
		},
	});
}

function add_applicants_to_topic(frm, selections, applicant_type) {
	selections.forEach(function (applicant) {
		const row = frm.add_child("applicants", {
			applicant_type: applicant_type,
		});
		frappe.model.set_value(row.doctype, row.name, "applicant", applicant); //do it with set_value , so the applicant name is populated but if we do it inside the add child it will not
	});
	frm.refresh_field("applicants");
}

function get_applicant_type_info(frm, applicant_type) {
	let academic_opts = {
		source_doctype: "Faculty Member",
		target: frm,
		// date_field: "",
		setters: {
			company: "",
			faculty_member_name: "",
			academic_rank: "",
		},

		get_query: function () {
			return {
				filters: {},
			};
		},
		add_filters_group: 1,
		size: "large",
	};
	let student_opts = {
		source_doctype: "Student",
		target: frm,
		// date_field: "",
		setters: {
			academic_level: "",
			academic_status: "",
			gender: "",
			joining_date: "",
		},
		get_query: function () {
			return {
				filters: {},
			};
		},
		add_filters_group: 1,
		size: "large",
	};

	switch (applicant_type) {
		case "Student":
			return student_opts;
		case "Faculty Member":
			return academic_opts;
		default:
			return "Employee"; // Assuming 'Other' maps to 'Employee'
	}
}

function show_related_assignments(frm) {
	const container = $(frm.fields_dict.related_assignments.wrapper);
	container.empty(); // Clear previous data

	fetch_data(frm, function (data) {
		if (data.length > 0) {
			create_datatable(container, data);
		} else {
			$(container).html("No related assignments found.");
		}
	});
}

function fetch_data(frm, callback) {
	frm.call({
		method: "get_all_related_assignments",
		args: { topic_name: frm.doc.name },
		callback: function (r) {
			if (r.message) {
				const data = r.message.map((d) => [
					`<a href='/app/topic-assignment/${d.name}'>${d.name}</a>`,
					d.title,
					d.status,
					d.council,
					frappe.datetime.str_to_user(d.assignment_date),
					d.decision_type,
					d.parent_assignment,
					`<input type='checkbox' ${d.is_group ? "checked" : ""} disabled>`,
				]);
				callback(data);
			} else {
				callback([]);
			}
		},
	});
}

function create_datatable(container, data) {
	const datatable = new DataTable(container[0], {
		columns: [
			{ name: "Assignment", width: 180, editable: false },
			{ name: "Title", width: 220, editable: false },
			{ name: "Status", width: 120, editable: false },
			{ name: "Council", width: 150, editable: false },
			{ name: "Assignment Date", width: 150, editable: false },
			{ name: "Decision Type", width: 120, editable: false },
			{ name: "Parent Assignment", width: 150, editable: false },
			{ name: "Is Group", width: 50, editable: false },
		],
		data: data,
		dynamicRowHeight: true,
		checkboxColumn: false,
		inlineFilters: true,
	});

	datatable.style.setStyle(".dt-cell__content", {
		textAlign: "left",
	});
}
