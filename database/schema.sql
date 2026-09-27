-- ============================================================
-- ENYUKADO - Campus Marketplace Database Schema
-- Run this in SSMS against your CampusMarketplace database
-- ============================================================

-- CREATE DATABASE CampusMarketplace;
-- GO
-- USE CampusMarketplace;
-- GO

-- ============================================================
-- TABLE: Categories
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Categories' AND xtype='U')
BEGIN
    CREATE TABLE Categories (
        CategoryID   INT           PRIMARY KEY IDENTITY(1,1),
        CategoryName NVARCHAR(100) NOT NULL UNIQUE
    );

    INSERT INTO Categories (CategoryName) VALUES
        ('Books'),
        ('Electronics'),
        ('Clothing'),
        ('School Supplies'),
        ('Sports & Recreation'),
        ('Food & Drinks'),
        ('Services'),
        ('Others');

    PRINT '✅ Categories table created and seeded.';
END
GO

-- ============================================================
-- TABLE: Users
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
BEGIN
    CREATE TABLE Users (
        UserID            INT           PRIMARY KEY IDENTITY(1,1),
        FirstName         NVARCHAR(100) NOT NULL,
        LastName          NVARCHAR(100) NOT NULL,
        Email             NVARCHAR(255) NOT NULL UNIQUE,
        Password          NVARCHAR(255) NOT NULL,
        ContactNumber     NVARCHAR(50)  NULL,
        MessengerLink     NVARCHAR(255) NULL,
        ProfileImage      NVARCHAR(500) NULL,
        DateCreated       DATETIME      DEFAULT GETDATE(),
        PasswordChangedAt DATETIME      NULL
    );

    PRINT '✅ Users table created.';
END
GO

-- ============================================================
-- TABLE: Products
-- Condition values: 'Like new' | 'Good' | 'Used' | 'Fair' | 'Poor'
-- Status:          'Available' | 'Sold'
-- Quantity:        units seller has; decrements per purchase;
--                  flips to 'Sold' automatically when Quantity = 0
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Products' AND xtype='U')
BEGIN
    CREATE TABLE Products (
        ProductID        INT             PRIMARY KEY IDENTITY(1,1),
        UserID           INT             NOT NULL,
        CategoryID       INT             NOT NULL,
        ProductName      NVARCHAR(200)   NOT NULL,
        sellerName       NVARCHAR(200)   NOT NULL,
        Description      NVARCHAR(MAX)   NULL,
        Price            DECIMAL(10, 2)  NOT NULL,
        ProductCondition NVARCHAR(50)    NOT NULL,
        Quantity         INT             NOT NULL DEFAULT 1,
        ImageURL         NVARCHAR(500)   NULL,
        Status           NVARCHAR(20)    NOT NULL DEFAULT 'Available',
        DatePosted       DATETIME        NOT NULL DEFAULT GETDATE(),

        CONSTRAINT FK_Products_Users      FOREIGN KEY (UserID)     REFERENCES Users(UserID),
        CONSTRAINT FK_Products_Categories FOREIGN KEY (CategoryID) REFERENCES Categories(CategoryID),
        CONSTRAINT CHK_Products_Status    CHECK (Status IN ('Available', 'Sold')),
        CONSTRAINT CHK_Products_Condition CHECK (ProductCondition IN ('Like new', 'Good', 'Used', 'Fair', 'Poor'))
    );

    PRINT '✅ Products table created.';
END
ELSE
BEGIN
    -- Update condition constraint if table already exists
    IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CHK_Products_Condition')
    BEGIN
        ALTER TABLE Products DROP CONSTRAINT CHK_Products_Condition;
        ALTER TABLE Products ADD CONSTRAINT CHK_Products_Condition
            CHECK (ProductCondition IN ('Like new', 'Good', 'Used', 'Fair', 'Poor'));
        PRINT '✅ CHK_Products_Condition updated.';
    END
END
GO

-- ============================================================
-- TABLE: Cart
-- One row per buyer-product pair.
-- Checkout → creates Transaction + decrements Quantity.
-- If Quantity hits 0, Product.Status flips to 'Sold'.
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Cart' AND xtype='U')
BEGIN
    CREATE TABLE Cart (
        CartID    INT      PRIMARY KEY IDENTITY(1,1),
        UserID    INT      NOT NULL,
        ProductID INT      NOT NULL,
        DateAdded DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT UQ_Cart_User_Product UNIQUE (UserID, ProductID),
        CONSTRAINT FK_Cart_User         FOREIGN KEY (UserID)    REFERENCES Users(UserID),
        CONSTRAINT FK_Cart_Product      FOREIGN KEY (ProductID) REFERENCES Products(ProductID)
    );

    PRINT '✅ Cart table created.';
END
GO

-- ============================================================
-- TABLE: Transactions
-- Created when buyer checks out from cart.
-- Status: Pending → Completed (seller marks sold) | Cancelled
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Transactions' AND xtype='U')
BEGIN
    CREATE TABLE Transactions (
        TransactionID   INT          PRIMARY KEY IDENTITY(1,1),
        ProductID       INT          NOT NULL,
        BuyerID         INT          NOT NULL,
        SellerID        INT          NOT NULL,
        Status          NVARCHAR(20) NOT NULL DEFAULT 'Pending',
        TransactionDate DATETIME     NOT NULL DEFAULT GETDATE(),

        CONSTRAINT FK_Transactions_Product FOREIGN KEY (ProductID) REFERENCES Products(ProductID),
        CONSTRAINT FK_Transactions_Buyer   FOREIGN KEY (BuyerID)   REFERENCES Users(UserID),
        CONSTRAINT FK_Transactions_Seller  FOREIGN KEY (SellerID)  REFERENCES Users(UserID),
        CONSTRAINT CHK_Transactions_Status CHECK (Status IN ('Pending', 'Completed', 'Cancelled'))
    );

    PRINT '✅ Transactions table created.';
END
GO

-- ============================================================
-- TABLE: Reviews
-- One review per transaction, buyer only, after Completed.
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Reviews' AND xtype='U')
BEGIN
    CREATE TABLE Reviews (
        ReviewID      INT           PRIMARY KEY IDENTITY(1,1),
        TransactionID INT           NOT NULL UNIQUE,
        ReviewerID    INT           NOT NULL,
        Rating        INT           NOT NULL,
        Comment       NVARCHAR(MAX) NULL,
        DateCreated   DATETIME      NOT NULL DEFAULT GETDATE(),

        CONSTRAINT FK_Reviews_Transaction FOREIGN KEY (TransactionID) REFERENCES Transactions(TransactionID),
        CONSTRAINT FK_Reviews_Reviewer    FOREIGN KEY (ReviewerID)    REFERENCES Users(UserID),
        CONSTRAINT CHK_Reviews_Rating     CHECK (Rating BETWEEN 1 AND 5)
    );

    PRINT '✅ Reviews table created.';
END
GO

-- ============================================================
-- Fix existing NULL DatePosted rows (safe to run repeatedly)
-- ============================================================
UPDATE Products SET DatePosted = GETDATE() WHERE DatePosted IS NULL;
GO

-- ============================================================
-- Verify
-- ============================================================
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;
GO