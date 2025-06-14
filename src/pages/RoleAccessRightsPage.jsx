import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { callSoapService } from "@/services/callSoapService";
import { convertDataModelToStringData } from "@/utils/dataModelConverter";
import { Check, CheckSquare, ChevronDown, ChevronRight, ChevronsUpDown, Square } from "lucide-react";
import { useEffect, useState } from "react";

const TreeNode = ({
  node,
  level = 0,
  onSelect,
  onRemove,
  isRemovable = false,
  selectedItems = [],
  useCheckbox = false,
  onSelectAll = null,
  isSelectAllMode = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedItems.some((item) => item.id === node.id);

  const areAllChildrenSelected =
    hasChildren &&
    node.children.every((child) => {
      if (!child.children || child.children.length === 0) {
        return selectedItems.some((item) => item.id === child.id);
      }
      return checkAllChildrenSelected(child, selectedItems);
    });

  function checkAllChildrenSelected(node, selectedItems) {
    if (!node.children || node.children.length === 0) {
      return selectedItems.some((item) => item.id === node.id);
    }

    return node.children.every((child) => {
      if (!child.children || child.children.length === 0) {
        return selectedItems.some((item) => item.id === child.id);
      }
      return checkAllChildrenSelected(child, selectedItems);
    });
  }

  const getAllLeafNodes = (node) => {
    let leafNodes = [];

    if (!node.children || node.children.length === 0) {
      if (node.type === "Form") {
        return [node];
      }
      return [];
    }

    node.children.forEach((child) => {
      leafNodes = [...leafNodes, ...getAllLeafNodes(child)];
    });
    return leafNodes;
  };

  const handleCheckboxClick = (e) => {
    e.stopPropagation();

    if (hasChildren) {
      const allLeafNodes = getAllLeafNodes(node);
      if (areAllChildrenSelected) {
        onSelectAll(allLeafNodes, false);
      } else {
        onSelectAll(allLeafNodes, true);
      }
    } else {
      if (isRemovable && onSelectAll) {
        onSelectAll([node], !isSelected);
      } else if (onSelect) {
        onSelect(node);
      }
    }
  };

  return (
    <div>
      <div
        className={cn(
          "flex cursor-pointer select-none items-center rounded-sm px-2 py-1",
          level > 0 && "ml-4",
          areAllChildrenSelected && hasChildren && "font-medium",
        )}
        onClick={() => {
          if (hasChildren) {
            setIsOpen(!isOpen);
          } else if (onSelect && !useCheckbox) {
            onSelect(node);
          }
        }}
      >
        {hasChildren ? (
          <div className="mr-1">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</div>
        ) : (
          <div className="w-5"></div>
        )}

        {useCheckbox && (
          <div
            className="mr-2 flex cursor-pointer items-center justify-center"
            onClick={handleCheckboxClick}
          >
            {hasChildren ? (
              areAllChildrenSelected ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : (
                <Square className="h-4 w-4" />
              )
            ) : isSelected ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </div>
        )}

        <span className={cn("flex-grow text-sm", !hasChildren && !useCheckbox && "ml-1")}>{node.label}</span>

        {!hasChildren && !isRemovable && isSelected && !useCheckbox && <Check className="h-4 w-4 text-green-500" />}
      </div>

      {isOpen && hasChildren && (
        <div>
          {node.children.map((childNode, index) => (
            <TreeNode
              key={`${childNode.id}-${index}`}
              node={childNode}
              level={level + 1}
              onSelect={onSelect}
              onRemove={onRemove}
              isRemovable={isRemovable}
              selectedItems={selectedItems}
              useCheckbox={useCheckbox}
              onSelectAll={onSelectAll}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const TreeView = ({
  data,
  onSelect,
  onRemove,
  isRemovable = false,
  selectedItems = [],
  useCheckbox = false,
  onSelectAll = null,
  isSelectAllMode = false,
}) => {
  return (
    <div>
      {data.map((node, index) => (
        <TreeNode
          key={`${node.id}-${index}`}
          node={node}
          onSelect={onSelect}
          onRemove={onRemove}
          isRemovable={isRemovable}
          selectedItems={selectedItems}
          useCheckbox={useCheckbox}
          onSelectAll={onSelectAll}
          isSelectAllMode={isSelectAllMode}
        />
      ))}
    </div>
  );
};

const RoleAccessRightsPage = () => {
  const [roleDetails, setRoleDetails] = useState({
    roleName: "",
    roleId: "",
    description: "",
  });
  const [rolesList, setRolesList] = useState([]);

  const [openRolePopover, setOpenRolePopover] = useState(false);

  const [roleSearchInput, setRoleSearchInput] = useState("");

  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasFetchedData, setHasFetchedData] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formsList, setFormsList] = useState([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [treeData, setTreeData] = useState([]);
  const [filteredTreeData, setFilteredTreeData] = useState([]);
  const [selectedForms, setSelectedForms] = useState([]);
  const [assignedFormsTreeData, setAssignedFormsTreeData] = useState([]);

  const { toast } = useToast();
  const { userData } = useAuth();

  useEffect(() => {
    if (!hasFetchedData && userData?.userEmail && userData?.clientURL) {
      fetchRolesData();
      fetchFormsData();
      setHasFetchedData(true);
    }
  }, [userData?.userEmail, userData?.clientURL, hasFetchedData]);

  useEffect(() => {
    if (formsList.length > 0) {
      const treeStructure = [];
      const moduleMap = {};

      formsList.forEach((form) => {
        if (!moduleMap[form.MODULE_NAME]) {
          moduleMap[form.MODULE_NAME] = {
            id: `module-${form.MODULE_NAME}`,
            label: form.MODULE_NAME,
            children: {},
          };
        }

        const formTypes = moduleMap[form.MODULE_NAME].children;
        if (!formTypes[form.FORM_TYPE]) {
          formTypes[form.FORM_TYPE] = {
            id: `type-${form.MODULE_NAME}-${form.FORM_TYPE}`,
            label: form.FORM_TYPE,
            children: [],
          };
        }

        formTypes[form.FORM_TYPE].children.push({
          id: form.FORM_NAME,
          label: form.DESCRIPTION || form.FORM_NAME,
          formData: form,
          type: "Form",
        });
      });

      Object.values(moduleMap).forEach((module) => {
        const moduleNode = { id: module.id, label: module.label, children: [] };

        Object.values(module.children).forEach((formType) => {
          moduleNode.children.push(formType);
        });

        treeStructure.push(moduleNode);
      });

      setTreeData(treeStructure);
      setFilteredTreeData(treeStructure);
    }
  }, [formsList]);

  useEffect(() => {
    if (treeData.length > 0) {
      const filterFormsNotSelected = (tree) => {
        return tree
          .map((moduleNode) => {
            const newModuleNode = { ...moduleNode };

            if (newModuleNode.children && newModuleNode.children.length > 0) {
              newModuleNode.children = newModuleNode.children
                .map((formTypeNode) => {
                  const newFormTypeNode = { ...formTypeNode };

                  if (newFormTypeNode.children && newFormTypeNode.children.length > 0) {
                    newFormTypeNode.children = newFormTypeNode.children.filter(
                      (formNode) => !selectedForms.some((selectedForm) => selectedForm.id === formNode.id),
                    );
                  }

                  return newFormTypeNode;
                })
                .filter((formTypeNode) => formTypeNode.children && formTypeNode.children.length > 0);
            }

            return newModuleNode.children && newModuleNode.children.length > 0 ? newModuleNode : null;
          })
          .filter(Boolean);
      };

      setFilteredTreeData(filterFormsNotSelected(treeData));
    }
  }, [selectedForms, treeData]);

  useEffect(() => {
    if (selectedForms.length > 0) {
      const moduleMap = {};

      selectedForms.forEach((form) => {
        const moduleName = form.formData.MODULE_NAME;
        const formType = form.formData.FORM_TYPE || "General";

        if (!moduleMap[moduleName]) {
          moduleMap[moduleName] = {
            id: `assigned-module-${moduleName}`,
            label: moduleName,
            children: {},
          };
        }

        const formTypes = moduleMap[moduleName].children;
        if (!formTypes[formType]) {
          formTypes[formType] = {
            id: `assigned-type-${moduleName}-${formType}`,
            label: formType,
            children: [],
          };
        }

        formTypes[formType].children.push({
          id: form.id,
          label: form.label,
          formData: form.formData,
          type: "Form",
        });
      });

      const assignedTreeStructure = [];
      Object.values(moduleMap).forEach((module) => {
        const moduleNode = { id: module.id, label: module.label, children: [] };

        Object.values(module.children).forEach((formType) => {
          moduleNode.children.push(formType);
        });

        assignedTreeStructure.push(moduleNode);
      });

      setAssignedFormsTreeData(assignedTreeStructure);
    } else {
      setAssignedFormsTreeData([]);
    }
  }, [selectedForms]);

  const fetchRolesData = async () => {
    setLoadingRoles(true);
    try {
      const payload = {
        DataModelName: "general_roles_master",
        WhereCondition: "IS_FOR_APPROVAL = 'F'",
        Orderby: "ROLE_ID",
      };

      const response = await callSoapService(userData.clientURL, "DataModel_GetData", payload);

      const formattedRoles = response.map((role) => ({
        roleName: role.ROLE_NAME?.trim(),
        roleId: role.ROLE_ID.toString(),
        description: role.ROLE_DESCRIPTION || "",
      }));

      setRolesList(formattedRoles);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error fetching roles",
        description: error.message,
      });
    } finally {
      setLoadingRoles(false);
    }
  };

  const fetchFormsData = async () => {
    setLoadingForms(true);
    try {
      const payload = {
        DataModelName: "FORMS_MASTER",
        WhereCondition: "",
        Orderby: "MODULE_NAME, FORM_TYPE",
      };

      const response = await callSoapService(userData.clientURL, "DataModel_GetData", payload);

      const formsArray = Array.isArray(response) ? response : response?.data || [];
      setFormsList(formsArray);
    } catch (error) {
      setFormsList([]);
      toast({
        variant: "destructive",
        title: "Error fetching forms",
        description: error.message || "Failed to fetch forms master data",
      });
    } finally {
      setLoadingForms(false);
    }
  };

  const fetchRoleFormAccess = async (roleId) => {
    if (!roleId) return;

    setLoading(true);
    try {
      const payload = {
        DataModelName: "USER_RIGHTS_ROLES",
        WhereCondition: `ROLE_ID = '${roleId}'`,
        Orderby: "MODULE_NAME, FORM_NAME",
      };

      const response = await callSoapService(userData.clientURL, "DataModel_GetData", payload);

      if (!Array.isArray(response)) {
        setSelectedForms([]);
        setLoading(false);
        return;
      }

      const formItems = response.map((right) => ({
        id: right.FORM_NAME,
        label: right.FORM_NAME,
        formData: {
          MODULE_NAME: right.MODULE_NAME || "",
          FORM_NAME: right.FORM_NAME,
          DESCRIPTION: right.FORM_NAME,
          FORM_TYPE: right.FORM_TYPE || "",
        },
      }));

      setSelectedForms(formItems);

      try {
        const formNames = response.map((right) => `'${right.FORM_NAME}'`).join(",");
        if (formNames) {
          const payload = {
            DataModelName: "FORMS_MASTER",
            WhereCondition: `FORM_NAME IN (${formNames})`,
            Orderby: "MODULE_NAME, FORM_NAME",
          };

          const response = await callSoapService(userData.clientURL, "DataModel_GetData", payload);

          if (Array.isArray(response)) {
            const updatedFormItems = formItems.map((item) => {
              const formDetails = response.find((f) => f.FORM_NAME === item.id) || {};
              return {
                ...item,
                label: formDetails.DESCRIPTION || item.label,
                formData: {
                  ...item.formData,
                  DESCRIPTION: formDetails.DESCRIPTION || item.formData.DESCRIPTION,
                  FORM_TYPE: formDetails.FORM_TYPE || item.formData.FORM_TYPE,
                },
              };
            });
            setSelectedForms(updatedFormItems);
          }
        }
      } catch (error) {
        console.error("Error fetching form details:", error);
      }
    } catch (error) {
      console.error("Error fetching role form access:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch form access rights for this role",
      });
      setSelectedForms([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelect = (role) => {
    setRoleDetails({
      roleName: role.roleName,
      roleId: role.roleId,
      description: role.description || "",
    });
    setOpenRolePopover(false);
    fetchRoleFormAccess(role.roleId);
  };

  const handleFormSelect = (node) => {
    const isAlreadySelected = selectedForms.some((form) => form.id === node.id);

    if (!isAlreadySelected) {
      setSelectedForms((prev) => [...prev, node]);
      toast({
        title: "Form added",
        description: `${node.label} added to selection`,
      });
    } else {
      toast({
        variant: "default",
        title: "Info",
        description: "This form is already selected",
      });
    }
  };

  const handleBulkFormsSelection = (forms, shouldSelect) => {
    if (shouldSelect) {
      const formsToAdd = forms.filter((form) => !selectedForms.some((selectedForm) => selectedForm.id === form.id));

      if (formsToAdd.length > 0) {
        setSelectedForms((prev) => [...prev, ...formsToAdd]);
        toast({
          title: "Forms added",
          description: `${formsToAdd.length} forms added to selection`,
        });
      }
    } else {
      setSelectedForms((prev) => prev.filter((selectedForm) => !forms.some((form) => form.id === selectedForm.id)));

      toast({
        title: "Forms removed",
        description: `${forms.length} forms removed from selection`,
      });
    }
  };

  const handleRemoveSelectedForm = async (node) => {
    try {
      setSelectedForms((prev) => prev.filter((form) => form.id !== node.id));

      toast({
        title: "Form removed",
        description: `${node.label} removed from selection`,
        duration: 2000,
      });

      if (roleDetails.roleId) {
        try {
          const payload = {
            UserName: userData.userEmail,
            DataModelName: "USER_RIGHTS_ROLES",
            WhereCondition: `ROLE_ID = '${roleDetails.roleId}' AND FORM_NAME = '${node.id}'`,
          };

          const response = await callSoapService(userData.clientURL, "DataModel_DeleteData", payload);
        } catch (deleteError) {
          console.error("Error removing from database:", deleteError);
        }
      }
    } catch (error) {
      console.error("Error removing form:", error);
      toast({
        variant: "destructive",
        title: "Error removing form",
        description: error.message || "Failed to remove form access",
      });
    }
  };

  const handleRemoveMultipleSelectedForms = async (forms) => {
    try {
      setSelectedForms((prev) => prev.filter((selectedForm) => !forms.some((form) => form.id === selectedForm.id)));

      toast({
        title: "Forms removed",
        description: `${forms.length} forms removed from selection`,
        duration: 2000,
      });

      if (roleDetails.roleId) {
        for (const node of forms) {
          try {
            const payload = {
              UserName: userData.userEmail,
              DataModelName: "USER_RIGHTS_ROLES",
              WhereCondition: `ROLE_ID = '${roleDetails.roleId}' AND FORM_NAME = '${node.id}'`,
            };

            const response = await callSoapService(userData.clientURL, "DataModel_DeleteData", payload);
          } catch (deleteError) {
            console.error(`Error removing form ${node.id} from database:`, deleteError);
          }
        }
      }
    } catch (error) {
      console.error("Error removing multiple forms:", error);
      toast({
        variant: "destructive",
        title: "Error removing forms",
        description: error.message || "Failed to remove form access rights",
      });
    }
  };

  const handleSave = async () => {
    if (!roleDetails.roleId || selectedForms.length === 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please select both a role and at least one rights item",
      });
      return;
    }

    setSaving(true);
    try {
      for (const form of selectedForms) {
        const formAccessData = {
          ROLE_ID: roleDetails.roleId,
          MODULE_NAME: form.formData.MODULE_NAME,
          FORM_NAME: form.id,
          CAN_CUSTOMIZE: "F",
        };

        const data = convertDataModelToStringData("USER_RIGHTS_ROLES", formAccessData);

        const payload = {
          UserName: userData.userEmail,
          DModelData: data,
        };
        console.log(savePayload);

        const response = await callSoapService(userData.clientURL, "DataModel_SaveData", payload);

        if (saveResponse === null || saveResponse === undefined || (typeof saveResponse === "object" && saveResponse.error)) {
          throw new Error(`Failed to save category ${form.label} to role ${roleDetails.roleName}`);
        }
      }

      await fetchRoleFormAccess(roleDetails.roleId);

      toast({
        variant: "default",
        title: "Success",
        description: `Saved rights items to role ${roleDetails.roleName}`,
        duration: 3000,
      });
    } catch (error) {
      console.error("Save error:", error);
      toast({
        variant: "destructive",
        title: "Save failed",
        description: error.message || "Failed to save rights access rights",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setRoleDetails({ roleName: "", roleId: "", description: "" });
    setSelectedForms([]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-start gap-4 md:flex-row">
        {/* Role Details */}
        <div className="flex-grow">
          <div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              {/* Role Selector - Full width on mobile, 40% on desktop */}
              <div className="md:col-span-2">
                <Label>Select Roles:</Label>
                <Popover
                  open={openRolePopover}
                  onOpenChange={setOpenRolePopover}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="ml-2 w-full justify-between font-normal"
                    >
                      {roleDetails.roleName || "Select role name"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="z-50 h-[200px] w-[var(--radix-popover-trigger-width)] p-0">
                    <Command>
                      <CommandInput
                        placeholder="Search role name"
                        value={roleSearchInput}
                        onValueChange={setRoleSearchInput}
                      />
                      <CommandList>
                        {/* <CommandEmpty>No roles found.</CommandEmpty> */}
                        <CommandGroup>
                          {loadingRoles ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">Loading roles...</div>
                          ) : (
                            rolesList
                              .filter((role) => role.roleName.toLowerCase().includes(roleSearchInput.toLowerCase()))
                              .map((role) => (
                                <CommandItem
                                  key={`role-${role.roleId}`}
                                  value={role.roleName}
                                  onSelect={() => handleRoleSelect(role)}
                                >
                                  {role.roleName}
                                  <Check className={cn("ml-auto h-4 w-4", roleDetails.roleId === role.roleId ? "opacity-100" : "opacity-0")} />
                                </CommandItem>
                              ))
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Description - Full width on mobile (appears below), 60% on desktop */}
              <div className="mt-2 flex items-center text-left md:col-span-3 md:mt-7">
                <Label className="text-gray-500 md:ml-3">
                  <span className="truncate font-medium">Description:</span> {roleDetails.description || "-"}
                </Label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Add Rights */}
        <div className={cn(!roleDetails.roleId && "pointer-events-none opacity-50")}>
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-sm font-semibold">Add Access Rights</Label>
            <span className="text-xs text-gray-500"></span>
          </div>
          <div className="flex flex-col space-y-4">
            <div className="h-80 overflow-hidden rounded-md border">
              {loadingForms ? (
                <div className="flex h-full items-center justify-center">
                  <span className="text-sm text-muted-foreground">Loading forms...</span>
                </div>
              ) : filteredTreeData.length > 0 ? (
                <ScrollArea className="h-full w-full p-2">
                  <TreeView
                    data={filteredTreeData}
                    onSelect={handleFormSelect}
                    selectedItems={selectedForms}
                    useCheckbox={true}
                    onSelectAll={handleBulkFormsSelection}
                    isSelectAllMode={true}
                  />
                </ScrollArea>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="text-sm text-muted-foreground">All available forms are already added</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Remove Rights */}
        <div className={cn(!roleDetails.roleId && "pointer-events-none opacity-50")}>
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-sm font-semibold">Remove Access Rights</Label>
            <span className="text-xs text-gray-500">Assigned Forms ({selectedForms.length})</span>
          </div>
          <div className="flex flex-col space-y-4">
            <div className="h-80 overflow-hidden rounded-md border">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <span className="text-sm text-muted-foreground">Loading assigned forms...</span>
                </div>
              ) : assignedFormsTreeData.length > 0 ? (
                <ScrollArea className="h-full w-full p-2">
                  <TreeView
                    data={assignedFormsTreeData}
                    onRemove={handleRemoveSelectedForm}
                    isRemovable={true}
                    useCheckbox={true}
                    onSelectAll={handleRemoveMultipleSelectedForms}
                    isSelectAllMode={true}
                  />
                </ScrollArea>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="text-sm text-muted-foreground">No forms assigned to this role</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-4 md:self-end md:pb-6">
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={!roleDetails.roleId}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !roleDetails.roleId || selectedForms.length === 0}
        >
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
};

export default RoleAccessRightsPage;
