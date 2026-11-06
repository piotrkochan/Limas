Ext.define('Limas.ProjectAttachmentGrid', {
	extend: 'Limas.AttachmentGrid',
	alias: 'widget.ProjectAttachmentGrid',
	model: 'Limas.Entity.ProjectAttachment',
	onFileUploaded: function (response) {
		this.callParent(arguments);
		this.fireEvent('attachmentUploaded');
	}
});
