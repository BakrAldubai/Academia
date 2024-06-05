// Copyright (c) 2024, SanU and contributors
// For license information, please see license.txt

frappe.ui.form.on("Topic Assignment", {
	setup: function (frm) {
		$(`<style>
      .btn[data-fieldname="get_data_from_topic"] {
        background-color: #171717; /* Custom dark gray */
        color: white;
      }
      .btn[data-fieldname="get_data_from_topic"]:hover {
        background-color: #171710 !important;/* Slightly darker gray for interaction states */
        color: white !important;
      }
    </style>`).appendTo("head");

		// frm.add_fetch("topic", "topic_main_category", "main_category");
		// frm.add_fetch("topic", "topic_sub_category", "sub_category");
	},

	onload: function (frm) {
		// frm.events.topic_filters(frm);
		// frm.set_df_property("topic", "placeholder", "Council must be filled");
	},

	// topic_filters: function (frm) {
	// 	frm.set_query("topic", function () {
	// 		return {
	// 			query: "academia.councils.doctype.topic_assignment.topic_assignment.get_available_topics",
	// 			filters: {
	// 				council: frm.doc.council,
	// 				docstatus: 1,
	// 				status: ["Complete", "In Progress"],
	// 			},
	// 		};
	// 	});
	// },
	is_group: function (frm) {
		if (frm.doc.is_group) {
			// frm.events.clear_topic(frm); // clear topic field which will also clear the main and sub category fields if user enable is_group checkbox
		} else {
			frm.set_value("main_category", ""); //clear catetories if user disable is_group checkbox
			frm.set_value("sub_category", "");
		}
	},

	refresh: function (frm) {
		if (frm.is_new() || frm.doc.docstatus !== 0) {
			frm.toggle_display("get_assignments_to_group", false);
		} else {
			frm.toggle_display("get_assignments_to_group", true);
		}

		show_grouped_assignments(frm);

		frm.set_query("parent_assignment", function () {
			return {
				filters: {
					council: frm.doc.council,
					is_group: 1,
					decision_type: "", //empty ,not set , means assignment not scheduled for session
					docstatus: 0, // draft
				},
			};
		});
	},

	council: function (frm) {
		// frm.events.clear_topic(frm);
	},

	main_category(frm) {
		// Update the options for the sub-category field based on the selected main category
		frm.set_query("sub_category", function () {
			return {
				filters: {
					main_category: frm.doc.main_category,
				},
			};
		});
	},

	// get_data_from_topic: function (frm) {
	// 	if (frm.doc.topic) {
	// 		// Manually fetch the title and description from the "Topic" DocType
	// 		frappe.db
	// 			.get_value("Topic", { name: frm.doc.topic }, ["title", "description"])
	// 			.then((r) => {
	// 				if (r.message) {
	// 					// Manually set the fetched values to the form fields
	// 					frm.set_value("title", r.message.title);
	// 					frm.set_value("description", r.message.description);
	// 				}
	// 			});
	// 	}
	// },

	// clear_topic: function (frm) {
	// 	frm.set_value("topic", "");
	// 	frm.refresh_field("topic");
	// },

	get_assignments_to_group: function (frm) {
		new frappe.ui.form.MultiSelectDialog({
			doctype: "Topic Assignment",
			target: frm,
			setters: {
				title: null,
				main_category: null,
				sub_category: null,
				assignment_date: null,
			},
			add_filters_group: 1,
			// date_field: "transaction_date",
			// columns: ["title","main_category"],
			get_query() {
				return {
					filters: {
						is_group: 0,
						council: frm.doc.council,
						parent_assignment: "",
						decision_type: "", //empty ,not set , means assignment not scheduled for session
						docstatus: 0, // draft
						// status:"Accepted"
					},
				};
			},
			primary_action_label: "Get Assignments To Group",
			action: function (selections) {
				frappe.call({
					method: "academia.councils.doctype.topic_assignment.topic_assignment.add_assignments_to_group",
					args: {
						parent_name: frm.doc.name,
						assignments: JSON.stringify(selections), // Convert the selections array to a JSON string
					},
					callback: function (response) {
						if (response.message === "ok") {
							show_grouped_assignments(frm);
							frappe.show_alert({
								message: __("Assignment/s added successfully."),
								indicator: "green",
							});
						} else {
							frappe.show_alert({
								message: __(`Error adding assignments!`),
								indicator: "red",
							});
							console.error(response.message);
						}
					},
					error: function (error) {
						console.error(error);
						frappe.show_alert({
							message: __("Error adding assignments!"),
							indicator: "red",
						});
					},
				});
				this.dialog.hide();
			},
		});
	},
});

function show_grouped_assignments(frm) {
	const container = $(frm.fields_dict.grouped_assignments.wrapper);
	container.empty(); // Clear previous data

	if (frm.is_new()) {
		$(container).html(
			"<h3>You should save this document before adding grouped assignments!</h3>"
		);
		return;
	}

	fetch_assignments_data(frm, function (data) {
		if (data.length > 0) {
			create_datatable(frm, container, data);
		} else {
			$(container).html("<h3>No grouped assignments added yet!</h3>");
		}
	});
}

function fetch_assignments_data(frm, callback) {
	frm.call({
		method: "get_grouped_assignments",
		args: { parent_name: frm.doc.name },
		callback: function (r) {
			const data = r.message ? format_assignment_data(r.message) : [];
			callback(data);
		},
	});
}

function format_assignment_data(assignments) {
	return assignments.map((d) => [
		`<input type="checkbox" data-assignment="${d.name}">`,
		`<a href='/app/topic-assignment/${d.name}'>${d.name}</a>`,
		d.title,
		frappe.datetime.str_to_user(d.assignment_date),
		d.decision_type,
	]);
}

function create_datatable(frm, container, data) {
	const datatable = new DataTable(container[0], {
		columns: get_datatable_columns(),
		data: data,
		dynamicRowHeight: true,
		checkboxColumn: false,
		// inlineFilters: true,
	});

	datatable.style.setStyle(".dt-cell__content", { textAlign: "left" });

	const deleteButton = $("<button>")
		.text("Delete")
		.addClass("btn btn-danger")
		.css({ marginBottom: "10px", visibility: "hidden" })
		.on("click", function () {
			const selectedRows = get_selected_rows();
			if (selectedRows.length > 0) {
				frappe.confirm(
					"Are you sure you want to delete the selected topic assignments?",
					function () {
						handleDeletion(frm, selectedRows);
					}
				);
			}
		});

	container.append(deleteButton);

	container.on("change", "input[data-assignment]", function () {
		const selectedRows = get_selected_rows();
		if (selectedRows.length > 0) {
			deleteButton.css("visibility", "visible"); // Correct property setting
		} else {
			deleteButton.css("visibility", "hidden"); // Correct property setting
		}
	});

	// Add event listener for the "Select All" checkbox
	container.on("change", 'input[data-assignment1="All"]', function () {
		const isChecked = $(this).prop("checked");
		$("input[data-assignment]")
			.not('[data-assignment1="All"]')
			.prop("checked", isChecked)
			.trigger("change");
	});
}

function get_selected_rows() {
	const selectedRows = [];
	$("input[data-assignment]:checked").each(function () {
		selectedRows.push($(this).data("assignment"));
	});
	return selectedRows;
}

function get_datatable_columns() {
	return [
		{
			name: `<input type="checkbox" data-assignment1="All">`,
			width: 50,
			editable: false,
			sortable: false,
		},
		{ name: "Assignment", width: 300, editable: false },
		{ name: "Title", width: 300, editable: false },
		{ name: "Assignment Date", width: 150, editable: false },
		{ name: "Decision Type", width: 143, editable: false },
	];
}

function delete_assignments_from_group(frm, assignment_names, callback) {
	frappe.call({
		method: "academia.councils.doctype.topic_assignment.topic_assignment.delete_assignments_from_group",
		args: {
			assignment_names: JSON.stringify(assignment_names), // Convert the array to a JSON string
		},
		callback: function (response) {
			if (response.message === "ok") {
				callback(null);
			} else {
				callback(new Error(response.message));
			}
		},
		error: function (error) {
			callback(error);
		},
	});
}

function handleDeletion(frm, selectedRows) {
	delete_assignments_from_group(frm, selectedRows, function (error) {
		if (error) {
			frappe.show_alert({
				message: __("Error removing assignments!"),
				indicator: "red",
			});
			console.error(error);
		} else {
			frappe.show_alert({
				message: __("Assignments removed successfully."),
				indicator: "green",
			});
			show_grouped_assignments(frm);
		}
	});
}
