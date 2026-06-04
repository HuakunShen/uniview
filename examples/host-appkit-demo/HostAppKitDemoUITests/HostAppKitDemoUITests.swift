import XCTest

final class HostAppKitDemoUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testCommandPaletteSelection() throws {
        let app = XCUIApplication()
        app.launch()

        let searchField = app.searchFields["command-search"]
        XCTAssertTrue(searchField.waitForExistence(timeout: 5), "command search field should be visible")

        let commandTable = app.tables["command-table"]
        XCTAssertTrue(commandTable.waitForExistence(timeout: 5), "command table should be visible")
        XCTAssertTrue(app.staticTexts["Issues Demo"].exists, "default command list should include Issues Demo")
        XCTAssertFalse(app.staticTexts["Raycast Demo"].exists, "default command list should not show the old brand label")
        XCTAssertTrue(app.staticTexts["Clipboard History"].exists, "default command list should include Clipboard History")

        let clipboardCell = commandTable.cells
            .containing(.staticText, identifier: "Clipboard History")
            .firstMatch
        XCTAssertTrue(clipboardCell.waitForExistence(timeout: 2), "Clipboard History command row should exist")
        clipboardCell.click()

        let contentTitle = app.staticTexts["content-title"]
        XCTAssertTrue(contentTitle.waitForExistence(timeout: 2), "content title should be visible")
        XCTAssertEqual(contentTitle.value as? String, "Clipboard History")
        XCTAssertTrue(app.buttons["run-command"].isEnabled, "selected command should be runnable")
    }

    func testClipboardFixtureRendersNativeListDetailImage() throws {
        let app = launchFixture("clipboard-image")

        let contentTitle = app.staticTexts["content-title"]
        XCTAssertTrue(contentTitle.waitForExistence(timeout: 5), "fixture content title should be visible")
        XCTAssertEqual(contentTitle.value as? String, "Clipboard History")

        let listSearch = app.searchFields["raycast-list-search"]
        XCTAssertTrue(listSearch.waitForExistence(timeout: 5), "list search field should render natively")
        XCTAssertGreaterThan(listSearch.frame.width, 180, "list search field should not collapse into a narrow strip")

        let listTable = app.tables["raycast-list-table"]
        XCTAssertTrue(listTable.waitForExistence(timeout: 5), "list table should render natively")
        XCTAssertTrue(app.staticTexts["Image (710x452)"].exists, "fixture image row should be visible")

        let previewImage = app.images["raycast-list-detail-image"]
        XCTAssertTrue(previewImage.waitForExistence(timeout: 5), "selected list item should render native detail image preview")

        XCTAssertTrue(app.staticTexts["Content type"].exists, "detail metadata title should be visible")
        XCTAssertTrue(app.staticTexts["Image"].exists, "detail metadata value should be visible")

        let pasteButton = app.buttons["Paste to Codex"]
        XCTAssertTrue(pasteButton.exists, "primary action should render as a native button")
        pasteButton.click()

        let statusLabel = app.staticTexts["status-label"]
        XCTAssertTrue(statusLabel.waitForExistence(timeout: 2), "status label should expose fixture action results")
        XCTAssertEqual(statusLabel.value as? String, "Fixture action: fixture-paste-clip-image-1")

        listSearch.click()
		let actionsButton = app.buttons["Actions"]
		XCTAssertTrue(actionsButton.waitForExistence(timeout: 2), "list should expose a native Actions button")
		actionsButton.click()

		let actionPanel = app.tables["raycast-action-panel-table"]
        XCTAssertTrue(actionPanel.waitForExistence(timeout: 3), "Cmd+K should open the native action panel")
        XCTAssertTrue(app.staticTexts["Paste to Codex"].exists, "action panel should show the primary action")
        XCTAssertTrue(app.staticTexts["Copy to Clipboard"].exists, "action panel should show secondary actions")
    }

    func testGridFixtureRendersNativeGridAndActions() throws {
        let app = launchFixture("grid-assets")

        let contentTitle = app.staticTexts["content-title"]
        XCTAssertTrue(contentTitle.waitForExistence(timeout: 5), "fixture content title should be visible")
        XCTAssertEqual(contentTitle.value as? String, "Grid Demo")

        let gridSearch = app.searchFields["raycast-grid-search"]
        XCTAssertTrue(gridSearch.waitForExistence(timeout: 5), "grid search field should render natively")
        XCTAssertGreaterThan(gridSearch.frame.width, 180, "grid search field should not collapse into a narrow strip")

        let grid = app.collectionViews["raycast-grid-collection"]
        XCTAssertTrue(grid.waitForExistence(timeout: 5), "grid collection should render natively")
        XCTAssertTrue(app.staticTexts["Screenshot"].exists, "fixture screenshot grid item should be visible")
        XCTAssertTrue(app.staticTexts["Document"].exists, "fixture document grid item should be visible")

        let copyButton = app.buttons["Copy Asset Name"]
        XCTAssertTrue(copyButton.waitForExistence(timeout: 2), "selected grid item should expose native actions")
        copyButton.click()

        let statusLabel = app.staticTexts["status-label"]
        XCTAssertTrue(statusLabel.waitForExistence(timeout: 2), "status label should expose fixture action results")
        XCTAssertEqual(statusLabel.value as? String, "Fixture action: fixture-copy-asset-photo")

		let actionsButton = app.buttons["Actions"]
		XCTAssertTrue(actionsButton.waitForExistence(timeout: 2), "grid should expose a native Actions button")
		actionsButton.click()

		let actionPanel = app.tables["raycast-action-panel-table"]
		XCTAssertTrue(actionPanel.waitForExistence(timeout: 3), "Actions should open the grid action panel")
        XCTAssertTrue(app.staticTexts["Open Preview"].exists, "grid action panel should show secondary actions")
    }

    func testFormFixtureRendersNativeControlsAndAction() throws {
        let app = launchFixture("preferences-form")

        let contentTitle = app.staticTexts["content-title"]
        XCTAssertTrue(contentTitle.waitForExistence(timeout: 5), "fixture content title should be visible")
        XCTAssertEqual(contentTitle.value as? String, "Preferences Form")

        XCTAssertTrue(app.staticTexts["Command Name"].exists, "form text field label should be visible")
        XCTAssertTrue(app.staticTexts["Description"].exists, "form text area label should be visible")
        XCTAssertTrue(app.staticTexts["Default Clipboard Type"].exists, "form dropdown label should be visible")

        let nameField = app.textFields["raycast-form-text-name"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 5), "form text field should be native and accessible")

        let tokenField = app.secureTextFields["raycast-form-password-secret"]
        XCTAssertTrue(tokenField.waitForExistence(timeout: 5), "form password field should be secure, native, and accessible")

        let typeDropdown = app.popUpButtons["raycast-form-dropdown-default-type"]
        XCTAssertTrue(typeDropdown.waitForExistence(timeout: 5), "form dropdown should be native and accessible")

        let saveButton = app.buttons["Save Preferences"]
        XCTAssertTrue(saveButton.waitForExistence(timeout: 2), "form action should render as a native button")
        saveButton.click()

        let statusLabel = app.staticTexts["status-label"]
        XCTAssertTrue(statusLabel.waitForExistence(timeout: 2), "status label should expose fixture action results")
        XCTAssertEqual(statusLabel.value as? String, "Fixture action: fixture-save-preferences")
    }

    private func launchFixture(_ fixture: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["UNIVIEW_APPKIT_UI_FIXTURE"] = fixture
        app.launch()
        return app
    }
}
